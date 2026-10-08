import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'

export default function VoiceCall({ call, me, onEnd }) {
  const audioRef = useRef(null)
  const peerRef = useRef(null)
  const streamRef = useRef(null)
  const channelRef = useRef(null)
  const pendingIceRef = useRef([])
  const offerCreatedRef = useRef(false)

  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let mounted = true

    async function startCall() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        })

        if (!mounted) return

        streamRef.current = stream

        const isCaller = call.caller_id === me.id

        const peer = new RTCPeerConnection({
          iceServers: [
            {
              urls: 'stun:stun.l.google.com:19302'
            }
          ]
        })

        peerRef.current = peer

        stream.getTracks().forEach((track) => {
          peer.addTrack(track, stream)
        })

        const channel = supabase.channel(
          'voice-call-' + call.id,
          {
            config: {
              presence: {
                key: me.id
              }
            }
          }
        )

        channelRef.current = channel

        peer.onicecandidate = async (event) => {
          if (!event.candidate) return

          await channel.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: event.candidate
          })
        }

        peer.onconnectionstatechange = () => {
          console.log('VOICE CONNECTION:', peer.connectionState)

          if (peer.connectionState === 'connected') {
            setConnected(true)
          }

          if (
            peer.connectionState === 'failed' ||
            peer.connectionState === 'disconnected' ||
            peer.connectionState === 'closed'
          ) {
            setConnected(false)
          }
        }

        peer.ontrack = (event) => {
          if (audioRef.current) {
            audioRef.current.srcObject = event.streams[0]
          }
        }

        async function createOffer() {
          if (!isCaller) return
          if (offerCreatedRef.current) return

          offerCreatedRef.current = true

          try {
            const offer = await peer.createOffer()

            await peer.setLocalDescription(offer)

            await channel.send({
              type: 'broadcast',
              event: 'offer',
              payload: offer
            })

            console.log('VOICE OFFER SENT')
          } catch (error) {
            offerCreatedRef.current = false
            console.error('Offer error:', error)
          }
        }

        channel
          .on('presence', { event: 'sync' }, async () => {
            const state = channel.presenceState()

            console.log('VOICE PRESENCE:', state)

            const users = Object.keys(state)

            console.log('VOICE USERS:', users)
            alert('VOICE USERS: ' + users.length)

            if (
              isCaller &&
              users.includes(me.id) &&
              users.length >= 2
            ) {
              console.log('VOICE BOTH USERS READY')

              await createOffer()
            }
          })

          .on('broadcast', { event: 'offer' }, async ({ payload }) => {
            try {
              if (isCaller) return

              console.log('VOICE OFFER RECEIVED')

              await peer.setRemoteDescription(payload)

              const answer = await peer.createAnswer()

              await peer.setLocalDescription(answer)

              await channel.send({
                type: 'broadcast',
                event: 'answer',
                payload: answer
              })

              console.log('VOICE ANSWER SENT')
            } catch (error) {
              console.error('Answer error:', error)
            }
          })

          .on('broadcast', { event: 'answer' }, async ({ payload }) => {
            try {
              if (!isCaller) return

              console.log('VOICE ANSWER RECEIVED')

              await peer.setRemoteDescription(payload)

              for (const candidate of pendingIceRef.current) {
                await peer.addIceCandidate(candidate)
              }

              pendingIceRef.current = []

              console.log('VOICE REMOTE DESCRIPTION SET')
            } catch (error) {
              console.error('Answer receive error:', error)
            }
          })

          .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
            try {
              if (!payload) return

              if (peer.remoteDescription) {
                await peer.addIceCandidate(payload)
              } else {
                pendingIceRef.current.push(payload)
              }
            } catch (error) {
              console.error('ICE candidate error:', error)
            }
          })

          .subscribe(async (status) => {
            console.log('VOICE SIGNAL:', status)

            if (status === 'SUBSCRIBED') {
              console.log('VOICE CHANNEL READY')

              const presenceResult = await channel.track({
                user_id: me.id,
                call_id: call.id
              })

              console.log(
                'VOICE PRESENCE TRACKED:',
                presenceResult
              )
            }
          })

        console.log('WebRTC Peer Connection Created')
        console.log('CALL:', call)
      } catch (error) {
        console.error(error)
        alert('Microphone permission denied.')
      }
    }

    startCall()

    return () => {
      mounted = false

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }

      if (peerRef.current) {
        peerRef.current.close()
        peerRef.current = null
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop()
        })

        streamRef.current = null
      }

      pendingIceRef.current = []
      offerCreatedRef.current = false
    }
  }, [call, me.id])

  function endCall() {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    if (peerRef.current) {
      peerRef.current.close()
      peerRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop()
      })

      streamRef.current = null
    }

    onEnd()
  }

  return (
    <div className="voice-call">
      <audio ref={audioRef} autoPlay />

      <h2>Voice Call</h2>

      <p>{connected ? 'Connected' : 'Connecting...'}</p>

      <button type="button" onClick={endCall}>
        End Call
      </button>
    </div>
  )
}