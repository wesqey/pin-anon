import React, { useState } from "react";
import ProfilePicture from "./ProfilePicture";

export function CommentBlock({ post, addComment, removeComment, whisper, dark, user, firebaseUser, legacyUserId, isRoomMod, enterProfile }) {
  const [commentText, setCommentText] = useState("");
  const [showComments, setShowComments] = useState(false);

  const topLevelComments = (post.comments || []).filter(c => !c.parentId);

  return (
    <div>
      <div style={{ marginBottom: '15px' }}>
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="ADD A COMMENT..."
          style={{
            width: '100%',
            minHeight: '60px',
            fontSize: '12px',
            letterSpacing: '0.02em',
            padding: '12px',
            background: 'none',
            border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
            outline: 'none',
            resize: 'vertical',
            color: dark ? '#fff' : '#000',
            fontFamily: 'Helvetica Neue, Arial, sans-serif'
          }}
        />
        <button
          onClick={() => {
            if (commentText.trim()) {
              addComment(post.id, commentText.trim());
              setCommentText("");
              setShowComments(true);
            }
          }}
          style={{
            fontSize: '10px',
            letterSpacing: '0.1em',
            padding: '8px 16px',
            marginTop: '8px',
            background: 'none',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            cursor: 'pointer',
            color: dark ? '#fff' : '#000',
            transition: 'border-color 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
          onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
        >
          POST
        </button>
      </div>

      {topLevelComments.length > 0 && (
        <div>
          <button
            onClick={() => setShowComments(!showComments)}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#999' : '#666',
              marginBottom: '15px',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            {showComments ? '▼' : '▶'} {topLevelComments.length} COMMENT{topLevelComments.length !== 1 ? 'S' : ''}
          </button>

          {showComments && (
            <div style={{ 
              borderLeft: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
              paddingLeft: '20px',
              marginTop: '15px'
            }}>
              {topLevelComments.map(comment => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  allComments={post.comments || []}
                  postId={post.id}
                  addComment={addComment}
                  removeComment={removeComment}
                  whisper={whisper}
                  dark={dark}
                  user={user}
                  firebaseUser={firebaseUser}
                  legacyUserId={legacyUserId}
                  isRoomMod={isRoomMod}
                  enterProfile={enterProfile}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CommentThread({ comment, allComments, postId, addComment, removeComment, whisper, dark, user, firebaseUser, legacyUserId, isRoomMod, enterProfile, depth = 0 }) {
  const [replyText, setReplyText] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [showReplies, setShowReplies] = useState(true);

  const replies = allComments.filter(c => c.parentId === comment.id);
  
  const isCreator = comment.author === user.id 
    || (firebaseUser && comment.authorId === firebaseUser.uid)
    || (legacyUserId && comment.author === legacyUserId);

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
          <ProfilePicture authorId={comment.authorId} author={comment.author} size={24} dark={dark} />
          <button
            onClick={() => enterProfile(comment.author)}
            style={{
              fontSize: '10px',
              letterSpacing: '0.05em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#fff' : '#000',
              textDecoration: 'underline',
              padding: 0
            }}
          >
            {comment.authorDisplayName || comment.author?.toUpperCase() || 'UNKNOWN'}
          </button>
          {!whisper && (
            <span style={{
              fontSize: '9px',
              color: dark ? '#666' : '#999'
            }}>
              {new Date(comment.created).toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric'
              })}
            </span>
          )}
        </div>
        <div style={{
          fontSize: '12px',
          lineHeight: '1.6',
          letterSpacing: '0.02em',
          color: dark ? '#fff' : '#000',
          wordWrap: 'break-word',
          overflowWrap: 'break-word'
        }}>
          {comment.text}
        </div>
        <div style={{ display: 'flex', gap: '15px', marginTop: '8px' }}>
          <button
            onClick={() => setShowReply(!showReply)}
            style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#666' : '#999',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            REPLY
          </button>
          {(user.isAdmin || isCreator || isRoomMod) && (
            <button
              onClick={() => removeComment(postId, comment.id)}
              style={{
                fontSize: '9px',
                letterSpacing: '0.1em',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: dark ? '#666' : '#999',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.5'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              DELETE
            </button>
          )}
        </div>
      </div>

      {showReply && (
        <div style={{ marginLeft: '34px', marginTop: '10px', marginBottom: '15px' }}>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="WRITE A REPLY..."
            style={{
              width: '100%',
              minHeight: '50px',
              fontSize: '11px',
              letterSpacing: '0.02em',
              padding: '10px',
              background: 'none',
              border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
              outline: 'none',
              resize: 'vertical',
              color: dark ? '#fff' : '#000',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          />
          <button
            onClick={() => {
              if (replyText.trim()) {
                addComment(postId, replyText.trim(), comment.id);
                setReplyText("");
                setShowReply(false);
                setShowReplies(true);
              }
            }}
            style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              padding: '6px 12px',
              marginTop: '6px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: 'pointer',
              color: dark ? '#fff' : '#000',
              transition: 'border-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
            onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
          >
            POST
          </button>
        </div>
      )}

      {replies.length > 0 && (
        <div style={{ marginLeft: '34px', marginTop: '15px' }}>
          <button
            onClick={() => setShowReplies(!showReplies)}
            style={{
              fontSize: '9px',
              letterSpacing: '0.1em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: dark ? '#666' : '#999',
              marginBottom: '10px',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            {showReplies ? '▼' : '▶'} {replies.length} REPL{replies.length !== 1 ? 'IES' : 'Y'}
          </button>
          {showReplies && (
            <div style={{
              borderLeft: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
              paddingLeft: '15px'
            }}>
              {replies.map(reply => (
                <CommentThread
                  key={reply.id}
                  comment={reply}
                  allComments={allComments}
                  postId={postId}
                  addComment={addComment}
                  removeComment={removeComment}
                  whisper={whisper}
                  dark={dark}
                  user={user}
                  firebaseUser={firebaseUser}
                  legacyUserId={legacyUserId}
                  isRoomMod={isRoomMod}
                  enterProfile={enterProfile}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ========== MODAL COMPONENTS ==========

