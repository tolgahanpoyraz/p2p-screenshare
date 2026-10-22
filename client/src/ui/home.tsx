import { useState } from 'preact/hooks';
import { parseRoomLink } from '../core/media.ts';
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
        <button class="btn btn-outline btn-md" type="submit" disabled={!link.trim()}>
          {t.join}
        </button>
      </div>
      {invalid && <p class="join-link-error">{t.joinLinkInvalid}</p>}
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
