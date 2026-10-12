"use client";

// Voice note attachment (should-have S1). Speaking is faster than typing, and Devanagari typing on
// a phone keyboard is slow. The recording is stored exactly as it was made; the transcript the model
// produces is labelled as an AI reading, never as the reporter's own words (project.md §3 rule 2).
//
// The MediaRecorder machinery lives at module scope rather than inside the component: it is plain
// browser plumbing with nothing to do with rendering, and keeping it out of the component body
// keeps the React part to state and wiring.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";

/** Must match MAX_AUDIO_BYTES in lib/reports/service.ts. */
const MAX_BYTES = 8 * 1024 * 1024;
const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

export interface VoiceNote {
  file: File;
  seconds: number;
  url: string;
}

interface ActiveRecording {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  startedAt: number;
  mimeType: string;
}

function detectSupport(): boolean {
  return typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

// Nothing to subscribe to: a browser does not gain a microphone mid-session. The third argument is
// the server snapshot, which is `null` — "not known yet" — so the first paint shows the recorder
// rather than briefly telling a reporter their phone cannot record.
const noSubscribe = () => () => {};

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type));
}

async function beginRecording(): Promise<ActiveRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();
  return { recorder, stream, chunks, startedAt: Date.now(), mimeType: recorder.mimeType || mimeType || "audio/webm" };
}

function endRecording(active: ActiveRecording): Promise<{ blob: Blob; seconds: number; mimeType: string }> {
  return new Promise((resolve) => {
    active.recorder.onstop = () => {
      active.stream.getTracks().forEach((track) => track.stop());
      // At least a second, so a very short note is never reported as zero length.
      const seconds = Math.max(1, Math.round((Date.now() - active.startedAt) / 1000));
      resolve({ blob: new Blob(active.chunks, { type: active.mimeType }), seconds, mimeType: active.mimeType });
    };
    active.recorder.stop();
  });
}

function releaseRecording(active: ActiveRecording): void {
  active.stream.getTracks().forEach((track) => track.stop());
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

export function VoiceRecorder({
  locale,
  note,
  onNote,
}: {
  locale: Locale;
  note: VoiceNote | null;
  onNote: (note: VoiceNote | null) => void;
}) {
  const t = translator(locale);
  const supported = useSyncExternalStore(noSubscribe, detectSupport, () => null);

  const [active, setActive] = useState<ActiveRecording | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef<ActiveRecording | null>(null);

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  // A recording in flight must not keep the microphone open if the page goes away.
  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (activeRef.current) releaseRecording(activeRef.current);
    },
    [],
  );

  async function start() {
    setError(null);
    try {
      const recording = await beginRecording();
      activeRef.current = recording;
      setActive(recording);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      setError(t("form.voiceDenied"));
    }
  }

  async function stop() {
    const recording = activeRef.current;
    if (!recording) return;
    clearTimer();
    activeRef.current = null;
    setActive(null);

    const { blob, seconds: length } = await endRecording(recording);
    if (blob.size > MAX_BYTES) {
      setError(t("form.attachments", { n: 4, mb: 8 }));
      return;
    }
    const extension = recording.mimeType.includes("mp4") ? "m4a" : "webm";
    onNote({
      file: new File([blob], `voice-note.${extension}`, { type: recording.mimeType }),
      seconds: length,
      url: URL.createObjectURL(blob),
    });
  }

  if (supported === false) {
    return <p className="rounded-xl bg-sand px-3 py-2 text-sm text-muted-foreground">{t("form.voiceUnsupported")}</p>;
  }

  const recording = active !== null;

  return (
    <div className="flex flex-col gap-2">
      {note ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
          <div className="flex items-center gap-3">
            <Mic className="size-4 shrink-0 text-ink-soft" aria-hidden />
            <span className="text-sm font-medium">{formatSeconds(note.seconds)}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onNote(null)} className="ml-auto h-7 rounded-full px-2">
              <X className="size-3.5" aria-hidden />
              {t("form.voiceRemove")}
            </Button>
          </div>
          <audio src={note.url} controls className="h-9 w-full" />
        </div>
      ) : recording ? (
        <Button
          type="button"
          onClick={() => void stop()}
          className="h-12 rounded-xl bg-flame-strong text-base text-white hover:bg-flame-strong/90"
        >
          <Square className="size-4" aria-hidden />
          {t("form.voiceStop")} · {formatSeconds(seconds)}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => void start()}
          className="h-12 justify-start rounded-xl border-dashed text-base"
        >
          <Mic className="size-4" aria-hidden />
          {t("form.voiceStart")}
        </Button>
      )}

      {recording ? (
        <p className="flex items-center gap-2 text-sm text-flame-strong" aria-live="polite">
          <span className="size-2 animate-pulse rounded-full bg-flame-strong" aria-hidden />
          {t("form.voiceRecording")}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("form.voiceHint")}</p>
      )}

      {error ? (
        <p className="flex items-start gap-2 rounded-xl bg-amber-tint px-3 py-2 text-sm text-amber-strong">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
