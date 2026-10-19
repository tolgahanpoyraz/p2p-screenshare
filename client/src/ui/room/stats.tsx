import { useState } from 'preact/hooks';
import type { Slot } from '../../core/call.ts';
import type { ConnectionStats, StatsSampler, StreamStats } from '../../core/stats.ts';
import { useInterval } from '../hooks.ts';
import { t } from '../i18n.ts';

const order: [StreamStats['direction'], Slot][] = [
  ['receive', 'screen'],
  ['receive', 'camera'],
  ['receive', 'mic'],
  ['receive', 'screenAudio'],
  ['send', 'mic'],
  ['send', 'screen'],
  ['send', 'screenAudio'],
  ['send', 'camera'],
];

const names: Record<Slot, string> = { mic: 'voice', camera: 'camera', screen: 'screen', screenAudio: 'show audio' };

function describe(s: StreamStats) {
  const name = s.direction === 'send' && s.slot === 'mic' ? 'mic' : names[s.slot];
  const codec = s.kind === 'video' ? s.codec?.toUpperCase() : s.codec;
  const engine = s.kind === 'video' && s.implementation && `${s.hardware ? 'hw' : 'sw'} ${s.direction === 'send' ? 'encode' : 'decode'}`;
  const rate = s.kbps >= 1000 ? `${(s.kbps / 1000).toFixed(1)} Mbps` : `${s.kbps} kbps`;
  const first = s.kind === 'video' && s.width ? `${s.width}×${s.height} · ${Math.round(s.fps ?? 0)} fps · ${rate}` : rate;
  const second = [
    s.lossPercent !== undefined && `loss ${s.lossPercent}%`,
    s.jitterMs !== undefined && `jitter ${Math.round(s.jitterMs)} ms`,
    s.decodeMs !== undefined && `decode ${s.decodeMs} ms`,
    s.limitation !== undefined && `limit: ${s.limitation}`,
  ].filter(Boolean);
  return { title: `${s.direction === 'send' ? '↑' : '↓'} ${name}`, right: [codec, engine].filter(Boolean).join(' · '), first, second: second.join(' · ') };
}

export function StatsOverlay({ sampler, right, onClose }: { sampler: StatsSampler; right: number; onClose(): void }) {
  const [stats, setStats] = useState<ConnectionStats | null>(null);
  useInterval(() => {
    sampler.sample().then(setStats, () => {});
  }, 1000);

  const streams = order.flatMap(([direction, slot]) => stats?.streams.filter((s) => s.direction === direction && s.slot === slot) ?? []);
  const route = stats?.route;
  return (
    <div class="stats" style={{ right: `${right}px` }} role="dialog" aria-label={t.stats}>
      <div class="stats-head">
        <strong>{t.statsTitle}</strong>
        <button class="ms" aria-label={t.closeStats} onClick={onClose}>
          close
        </button>
      </div>
      <div class="stats-line">
        <span>route {route ? `${route.relayed ? 'relay' : 'direct'} · ${route.protocol}` : '–'}</span>
        <span>rtt {stats?.rttMs !== undefined ? Math.round(stats.rttMs) : '–'} ms</span>
      </div>
      {streams.map((s) => {
        const d = describe(s);
        return (
          <div class="stats-stream" key={`${s.direction}-${s.slot}`}>
            <div class="stats-line">
              <strong>{d.title}</strong>
              <span>{d.right}</span>
            </div>
            <div class="stats-dim">{d.first}</div>
            {d.second && <div class="stats-dim">{d.second}</div>}
          </div>
        );
      })}
    </div>
  );
}
