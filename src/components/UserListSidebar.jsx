import React, { useState } from "react";
import ProfilePicture from "./ProfilePicture";

export function UserListSidebar({ posts, currentRoom, dark, windowWidth, onProfileClick }) {
  if (windowWidth < 1024) return null;

  const postsInRoom = posts.filter(p => p.room === currentRoom);
  const userCounts = {};
  
  postsInRoom.forEach(post => {
    const id = post.author;
    if (!userCounts[id]) {
      userCounts[id] = { 
        count: 0, 
        username: post.authorDisplayName || post.author,
        authorId: post.authorId || post.author
      };
    }
    userCounts[id].count++;
    
    (post.comments || []).forEach(comment => {
      const commentAuthor = comment.author;
      if (!userCounts[commentAuthor]) {
        userCounts[commentAuthor] = { 
          count: 0, 
          username: comment.authorDisplayName || comment.author,
          authorId: comment.authorId || comment.author
        };
      }
    });
  });

  const sortedUsers = Object.entries(userCounts)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10);

  if (sortedUsers.length === 0) return null;

  return (
    <div style={{
      width: '200px',
      paddingRight: '30px',
      borderRight: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
      flexShrink: 0
    }}>
      <div style={{
        fontSize: '10px',
        letterSpacing: '0.15em',
        color: dark ? '#666' : '#999',
        marginBottom: '20px'
      }}>
        ACTIVE USERS
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {sortedUsers.map(([userId, data]) => (
          <button
            key={userId}
            onClick={() => onProfileClick(userId)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0',
              textAlign: 'left',
              width: '100%'
            }}
          >
            <ProfilePicture authorId={data.authorId} author={userId} size={24} dark={dark} />
            <div style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '11px',
              letterSpacing: '0.05em',
              color: dark ? '#fff' : '#000',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.5'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              {data.username}
            </div>
            <div style={{
              fontSize: '9px',
              color: dark ? '#666' : '#999'
            }}>
              {data.count}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

