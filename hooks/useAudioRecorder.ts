'use client'

import { useRef, useState } from 'react'

interface UseAudioRecorderOptions {
  onComplete: (blob: Blob) => void
}

export function useAudioRecorder({ onComplete }: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const cancelledRef = useRef(false)

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
        stream.getTracks().forEach((t) => t.stop())
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
      setError('Não foi possível acessar o microfone. Verifique as permissões do navegador.')
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
