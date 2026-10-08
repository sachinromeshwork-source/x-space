export default function CallModal({
  type,
  caller,
  incoming,
  onAccept,
  onReject,
  onEnd,
}) {
  return (
    <div className="call-overlay">
      <div className="call-modal">

        <h2>{caller?.name || 'Unknown'}</h2>

        <p>
          {incoming
            ? 'Incoming Call'
            : 'Calling...'}
        </p>

        {incoming && (
          <div>
            <button onClick={onReject}>
              Reject
            </button>

            <button onClick={onAccept}>
              Accept
            </button>
          </div>
        )}

        {!incoming && (
          <button onClick={onEnd}>
            End Call
          </button>
        )}

      </div>
    </div>
  )
}