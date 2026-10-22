import { useEffect, useRef, useState } from 'preact/hooks';
import { parseRoomLink } from '../../../shared/protocol.ts';
import { desktop } from '../platform.ts';
import { Icon } from './controls.tsx';
import { t } from './i18n.ts';

export function Home({ onNewRoom, onJoin, onSetup }: { onNewRoom(): void; onJoin(roomId: string): void; onSetup(): void }) {
  return (
    <main class="home">
      <div class="logo" aria-hidden="true">
        <span class="logo-you" />
        <span class="logo-them" />
      </div>
      <div class="home-text">
        <h1>screenshare</h1>
        <p>{t.tagline}</p>
      </div>
      <div class="home-actions">
        <button class="btn btn-primary btn-lg" onClick={onNewRoom}>
          <Icon name="add" />
          {t.newRoom}
        </button>
        <button class="btn btn-ghost btn-md" onClick={onSetup}>
          <Icon name="tune" size={20} />
          {t.setUp}
        </button>
      </div>
      {desktop && <JoinLink onJoin={onJoin} />}
      <footer class="home-footer">{t.homeFooter}</footer>
    </main>
  );
}

function JoinLink({ onJoin }: { onJoin(roomId: string): void }) {
  const [link, setLink] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [pasted, setPasted] = useState<string | null>(null);
  const linkRef = useRef(link);
  const pastedRef = useRef(pasted);
  const joinButton = useRef<HTMLButtonElement>(null);
  linkRef.current = link;
  pastedRef.current = pasted;

  useEffect(() => {
    const check = async () => {
      const roomId = await desktop!.readInviteFromClipboard();
      if (!roomId) return;
      const invite = `${location.origin}/r/${roomId}`;
      if (invite === pastedRef.current) return;
      if (linkRef.current.trim() && linkRef.current !== pastedRef.current) return;
      setLink(invite);
      setPasted(invite);
      setInvalid(false);
    };
    check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  useEffect(() => {
    if (pasted) joinButton.current?.focus();
  }, [pasted]);

  const submit = (event: Event) => {
    event.preventDefault();
    const roomId = parseRoomLink(link);
    if (roomId) onJoin(roomId);
    else setInvalid(true);
  };

  return (
    <form class="join-link" onSubmit={submit}>
      <div class="join-link-row">
        <input
          class="input"
          placeholder={t.joinLinkPlaceholder}
          aria-label={t.joinLinkPlaceholder}
          aria-invalid={invalid}
          value={link}
          onInput={(event) => {
            setLink((event.currentTarget as HTMLInputElement).value);
            setInvalid(false);
          }}
        />
        <button ref={joinButton} class="btn btn-outline btn-md" type="submit" disabled={!link.trim()}>
          {t.join}
        </button>
      </div>
      {invalid && <p class="join-link-error">{t.joinLinkInvalid}</p>}
      {!invalid && pasted !== null && link === pasted && <p class="join-link-hint">{t.joinLinkFromClipboard}</p>}
    </form>
  );
}

export type Failure = 'room-full' | 'bad-room';

export function FailureScreen({ failure, onNewRoom }: { failure: Failure; onNewRoom(): void }) {
  const text =
    failure === 'room-full'
      ? { icon: 'group_off', title: t.roomFullTitle, body: t.roomFullBody }
      : { icon: 'link_off', title: t.badRoomTitle, body: t.badRoomBody };
  return (
    <main class="fullscreen-msg">
      <Icon name={text.icon} size={48} class="ink-3" />
      <h2>{text.title}</h2>
      <p>{text.body}</p>
      {failure === 'bad-room' && (
        <button class="btn btn-primary btn-md" onClick={onNewRoom}>
          {t.newRoom}
        </button>
      )}
    </main>
  );
}
