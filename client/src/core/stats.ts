import type { Call, Slot } from './call.ts';

export interface StreamStats {
  slot: Slot;
  direction: 'send' | 'receive';
  kind: 'audio' | 'video';
  codec?: string;
  kbps: number;
  width?: number;
  height?: number;
  fps?: number;
  packetsLost?: number;
  jitterMs?: number;
  implementation?: string;
  hardware?: boolean;
  limitation?: string;
  decodeMs?: number;
}

export interface ConnectionStats {
  rttMs?: number;
  availableOutgoingKbps?: number;
  route?: string;
  streams: StreamStats[];
}

type Report = Record<string, any>;

export class StatsSampler {
  private call: Call;
  private previous = new Map<string, { bytes: number; timestamp: number }>();

  constructor(call: Call) {
    this.call = call;
  }

  async sample(): Promise<ConnectionStats | null> {
    const pc = this.call.peerConnection;
    if (!pc) return null;
    const reports = new Map<string, Report>();
    (await pc.getStats()).forEach((report: Report) => reports.set(report.id, report));

    const result: ConnectionStats = { streams: [] };
    for (const report of reports.values()) {
      if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
        result.rttMs = msOf(report.currentRoundTripTime);
        result.availableOutgoingKbps = report.availableOutgoingBitrate && Math.round(report.availableOutgoingBitrate / 1000);
        const local = reports.get(report.localCandidateId);
        const remote = reports.get(report.remoteCandidateId);
        result.route = local && remote && `${local.candidateType} → ${remote.candidateType} (${local.protocol})`;
      }

      const direction = report.type === 'outbound-rtp' ? 'send' : report.type === 'inbound-rtp' ? 'receive' : null;
      const slot = direction && report.mid !== undefined && this.call.slotForMid(report.mid);
      if (!direction || !slot) continue;

      const bytes = direction === 'send' ? report.bytesSent : report.bytesReceived;
      if (!bytes) continue;
      const before = this.previous.get(report.id);
      this.previous.set(report.id, { bytes, timestamp: report.timestamp });
      const kbps = before ? ((bytes - before.bytes) * 8) / (report.timestamp - before.timestamp) : 0;

      result.streams.push({
        slot,
        direction,
        kind: report.kind,
        codec: reports.get(report.codecId)?.mimeType?.split('/')[1],
        kbps: Math.round(kbps),
        width: report.frameWidth,
        height: report.frameHeight,
        fps: report.framesPerSecond,
        packetsLost: report.packetsLost,
        jitterMs: msOf(report.jitter),
        implementation: report.encoderImplementation ?? report.decoderImplementation,
        hardware: report.powerEfficientEncoder ?? report.powerEfficientDecoder,
        limitation: report.qualityLimitationReason,
        decodeMs: report.framesDecoded ? msOf(report.totalDecodeTime / report.framesDecoded) : undefined,
      });
    }
    return result;
  }
}

function msOf(seconds: number | undefined) {
  return seconds === undefined ? undefined : Math.round(seconds * 10_000) / 10;
}
