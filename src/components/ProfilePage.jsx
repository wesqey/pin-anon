import React from "react";
import ProfilePicture from "./ProfilePicture";

export function ProfilePage({ authorId, posts, allPosts, user, firebaseUser, onBack, onEditProfile, onDeletePost, onEnterRoom, dark }) {
  const profileUser = allPosts.find(p => p.author === authorId);
  const isOwnProfile = authorId === user.id || (firebaseUser && authorId === firebaseUser.uid);
  const userData = {
    username: isOwnProfile ? user.username : (profileUser?.authorDisplayName || authorId),
    bio: isOwnProfile ? user.bio : null,
    profileImage: isOwnProfile ? user.profileImage : null
  };


  return (
    <div>
      <button
        onClick={onBack}
        style={{
          fontSize: '10px',
          letterSpacing: '0.15em',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: dark ? '#999' : '#666',
          marginBottom: '40px',
          transition: 'opacity 0.2s'
        }}
        onMouseEnter={(e) => e.target.style.opacity = '0.5'}
        onMouseLeave={(e) => e.target.style.opacity = '1'}
      >
        ← BACK
      </button>

      <div style={{ marginBottom: '60px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', marginBottom: '30px' }}>
          <ProfilePicture authorId={authorId} author={authorId} size={80} dark={dark} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '24px',
              letterSpacing: '0.1em',
              fontWeight: '300',
              marginBottom: '12px',
              color: dark ? '#fff' : '#000'
            }}>
              {userData.username}
            </div>
            {userData.bio && (
              <div style={{
                fontSize: '12px',
                letterSpacing: '0.02em',
                lineHeight: '1.6',
                color: dark ? '#999' : '#666',
                marginBottom: '20px'
              }}>
                {userData.bio}
              </div>
            )}
            <div style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: dark ? '#666' : '#999'
            }}>
              {posts.length} POST{posts.length !== 1 ? 'S' : ''}
            </div>
          </div>
          {isOwnProfile && (
            <button
              onClick={onEditProfile}
              style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '8px 16px',
                background: 'none',
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
                cursor: 'pointer',
                color: dark ? '#fff' : '#000',
                transition: 'border-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.borderColor = dark ? '#666' : '#999'}
              onMouseLeave={(e) => e.target.style.borderColor = dark ? '#333' : '#e5e5e5'}
            >
              EDIT
            </button>
          )}
        </div>
      </div>

      <div>
        {posts.length === 0 ? (
          <div style={{
            padding: '60px 0',
            textAlign: 'center',
            fontSize: '11px',
            letterSpacing: '0.1em',
            color: dark ? '#666' : '#999'
          }}>
            NO POSTS YET
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px'
          }}>
            {posts.sort((a, b) => b.created - a.created).map(post => (
              <div
              key={post.id}
              onClick={() => onEnterRoom(post.room, post.id)}
              style={{
                padding: '20px',
                border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                cursor: 'pointer',
                transition: 'border-color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = dark ? '#333' : '#e5e5e5'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = dark ? '#1a1a1a' : '#f5f5f5'}
            >
                {post.image && (
                  <img
                    src={post.image}
                    style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', marginBottom: '12px' }}
                    alt="post"
                  />
                )}
                {post.videoUrl && (
                  <div style={{ marginBottom: '12px' }}>
                    {post.videoUrl.includes('youtube.com') || post.videoUrl.includes('youtu.be') ? (
                      <iframe
                        width="100%"
                        height="180"
                        src={post.videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                        style={{ border: 'none' }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <video controls style={{ width: '100%', maxHeight: '200px' }}>
                        <source src={post.videoUrl} />
                      </video>
                    )}
                  </div>
                )}
                {post.audioUrl && (
                  post.audioUrl.includes('spotify.com') ? (
                    <iframe
                      src={post.audioUrl.replace('open.spotify.com/', 'open.spotify.com/embed/')}
                      width="100%"
                      height="80"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      style={{ marginBottom: '12px', borderRadius: '12px', border: 'none' }}
                    />
                  ) : (
                    <audio controls style={{ width: '100%', marginBottom: '12px' }}>
                      <source src={post.audioUrl} />
                    </audio>
                  )
                )}
                <div style={{
                  fontSize: '12px',
                  lineHeight: '1.6',
                  letterSpacing: '0.02em',
                  color: dark ? '#fff' : '#000',
                  marginBottom: '12px'
                }}>
                  {post.text.length > 150 ? `${post.text.slice(0, 150)}...` : post.text}
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '10px',
                  color: dark ? '#666' : '#999'
                }}>
                  <span>{new Date(post.created).toLocaleDateString()}</span>
                  {isOwnProfile && (
                    <button
                      onClick={() => onDeletePost(post.id)}
                      style={{
                        fontSize: '10px',
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

