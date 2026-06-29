"use client";

import { useEffect, useRef, useState } from "react";

// Minimal shapes for the Web Speech API (not in TS DOM lib by default).
interface SpeechRecognitionResultItem {
  transcript: string;
}
interface SpeechRecognitionResult {
  0: SpeechRecognitionResultItem;
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResult };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export interface DictationOptions {
  // Keep listening across pauses (auto-restarts on end) — for meeting mode.
  continuous?: boolean;
  // Surface interim (not-yet-final) text for a live preview.
  interim?: boolean;
}

// Free, in-browser dictation (§5). Calls `onFinal` with each finalized chunk.
// On Android/desktop Chrome this is full speech-to-text; on iOS Safari it's
// limited, so `supported` may be false (use the keyboard mic there).
export function useDictation(
  onFinal: (text: string) => void,
  options: DictationOptions = {},
) {
  const { continuous = true, interim = false } = options;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor })
        .webkitSpeechRecognition;
    if (!Ctor) return;

    setSupported(true);
    const recognition = new Ctor();
    recognition.lang = "en-SG";
    recognition.continuous = continuous;
    recognition.interimResults = interim;

    recognition.onresult = (event) => {
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          const trimmed = text.trim();
          if (trimmed) onFinalRef.current(trimmed);
        } else {
          live += text;
        }
      }
      if (interim) setInterimText(live);
    };

    recognition.onerror = (e) => {
      // "no-speech"/"aborted" are benign in continuous mode; keep going.
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        shouldListenRef.current = false;
        setListening(false);
      }
    };

    recognition.onend = () => {
      setInterimText("");
      if (shouldListenRef.current) {
        // Auto-restart so a pause in speech doesn't end a long capture.
        try {
          recognition.start();
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    return () => {
      shouldListenRef.current = false;
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [continuous, interim]);

  function start() {
    const recognition = recognitionRef.current;
    if (!recognition || shouldListenRef.current) return;
    shouldListenRef.current = true;
    try {
      recognition.start();
      setListening(true);
    } catch {
      // already started
    }
  }

  function stop() {
    const recognition = recognitionRef.current;
    shouldListenRef.current = false;
    setListening(false);
    setInterimText("");
    recognition?.stop();
  }

  function toggle() {
    if (listening) stop();
    else start();
  }

  return { supported, listening, interim: interimText, toggle, start, stop };
}
