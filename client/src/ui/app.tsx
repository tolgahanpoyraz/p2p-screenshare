import { useEffect, useState } from 'preact/hooks';
import { ROOM_ID_PATTERN } from '../../../shared/protocol.ts';
import { createRoomId } from '../core/media.ts';
import type { Session } from '../core/session.ts';
import { SettingsStore } from '../core/settings.ts';
import { desktop } from '../platform.ts';
import { FailureScreen, Home, type Failure } from './home.tsx';
import { useMediaQuery, useSettings, useSubscribe } from './hooks.ts';
import { setLanguage, t } from './i18n.ts';
import { people } from './identity.ts';
import { Prejoin } from './prejoin.tsx';
import type { Layout } from './room/geometry.ts';
import { Room } from './room/room.tsx';
import { SettingsModal, type SectionId } from './settings/settings.tsx';
import { toast, Toasts } from './toasts.tsx';

const store = new SettingsStore();

type Route = { page: 'home' } | { page: 'room'; roomId: string };

function currentRoute(): Route {
  const match = location.pathname.match(/^\/r\/([^/]+)$/);
  return match ? { page: 'room', roomId: decodeURIComponent(match[1]) } : { page: 'home' };
}

export function App() {
  const settings = useSettings(store);
  // Every component reads `t` while rendering, and they all re-render below App when settings change.
  setLanguage(settings.language);
  const [route, setRoute] = useState(currentRoute);
  const [session, setSession] = useState<Session | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [section, setSection] = useState<SectionId>('mic');
  const portrait = useMediaQuery('(orientation: portrait)');
  const light = useMediaQuery('(prefers-color-scheme: light)');
  const layout: Layout = desktop ? 'bar' : portrait ? 'portrait' : 'rail';
  const remoteProfile = useSubscribe(
    () => session?.call.remoteProfile ?? null,
    (n) => session?.call.on('remote-profile', n) ?? (() => {}),
    [session],
  );
  const { you, them } = people(settings, remoteProfile);

  const navigate = (path: string) => {
    history.pushState(null, '', path);
    setRoute(currentRoute());
  };

  const leave = () => {
    session?.leave();
    setSession(null);
  };

  useEffect(() => {
    const onPop = () => {
      leave();
      setFailure(null);
      setRoute(currentRoute());
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, [session]);

  useEffect(() => {
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
  }, [light]);

  // Keeps the global hotkey (and the settings test dot) live outside calls too.
  useEffect(() => {
    desktop?.pushToTalk.setBinding(settings.pushToTalkBinding).catch(() => {});
  }, [JSON.stringify(settings.pushToTalkBinding)]);

  useEffect(() => {
    if (route.page === 'room' && !ROOM_ID_PATTERN.test(route.roomId)) setFailure('bad-room');
  }, [route]);

  useEffect(() => {
    if (!session) return;
    Object.assign(window, {
      session,
      call: session.call,
      voice: session.voice,
      camera: session.camera,
      screenShare: session.screen,
    });
    const rejected = () => {
      const rejection = session.call.rejection;
      if (!rejection) return false;
      setFailure(rejection.code as Failure);
      leave();
      return true;
    };
    if (rejected()) return;
    return session.on('error', ({ code, message }) => {
      if (rejected()) return;
      toast(code === 'connection' ? t.serverUnreachable : t.somethingWrong(message), 'error');
    });
  }, [session]);

  const newRoom = () => {
    setFailure(null);
    navigate(`/r/${createRoomId()}`);
  };

  const openSettings = () => setSettingsOpen(true);

  let page;
  if (failure) page = <FailureScreen failure={failure} onNewRoom={newRoom} />;
  else if (route.page === 'home') page = <Home onNewRoom={newRoom} onSetup={openSettings} />;
  else if (!session) page = <Prejoin key={route.roomId} roomId={route.roomId} store={store} onJoined={setSession} />;
  else {
    page = (
      <Room
        session={session}
        store={store}
        roomId={route.roomId}
        layout={layout}
        settingsOpen={settingsOpen}
        onOpenSettings={openSettings}
        onLeave={() => {
          leave();
          navigate('/');
        }}
      />
    );
  }

  return (
    <div class={`app layout-${layout}`} style={{ '--you': you.color, '--them': them.color }}>
      {page}
      {settingsOpen && (
        <SettingsModal
          store={store}
          session={session}
          section={section}
          stacked={layout === 'portrait'}
          onSection={setSection}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <Toasts placement={session && !failure ? layout : 'home'} />
    </div>
  );
}

Object.assign(window, { settings: store });
