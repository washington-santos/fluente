'use client'

import { useRef, useState, useEffect } from 'react'

interface UseAudioRecorderOptions {
  onComplete: (blob: Blob) => void
}

export function useAudioRecorder({ onComplete }: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const cancelledRef = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)

  // Release microphone only on unmount, not between recordings
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  async function getStream(): Promise<MediaStream> {
    if (streamRef.current?.active) return streamRef.current
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream
    return stream
  }

  async function startRecording() {
    setError(null)
    try {
      const stream = await getStream()
      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
        MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' :
        undefined
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      cancelledRef.current = false

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        // Keep the stream alive for the next recording — only stop on unmount
        if (!cancelledRef.current) {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
          onComplete(blob)
        }
        cancelledRef.current = false
        setIsRecording(false)
      }

      recorder.start()
      recorderRef.current = recorder
      setIsRecording(true)
    } catch {
      setError('Microfone bloqueado. Toque no cadeado/configurações do navegador e permita o microfone.')
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
  }

  function cancelRecording() {
    cancelledRef.current = true
    recorderRef.current?.stop()
  }

  return { isRecording, startRecording, stopRecording, cancelRecording, error }
}
