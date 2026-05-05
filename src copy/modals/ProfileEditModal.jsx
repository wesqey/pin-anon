import React, { useState } from "react";

export function ProfileEditModal({ user, onSave, onClose, dark }) {
  const [bio, setBio] = useState(user.bio || "");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(user.profileImage || null);
  const [uploading, setUploading] = useState(false);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImageToMinIO = async (file) => {
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'x-filename': file.name,
        },
        body: file,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      return data.url;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  };

  const handleSave = async () => {
    setUploading(true);
    try {
      let profileImageUrl = user.profileImage;
      
      if (imageFile) {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': imageFile.type,
            'x-filename': imageFile.name,
          },
          body: imageFile,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        profileImageUrl = data.url;
      }
  
      onSave({
        ...user,
        bio: bio.trim() || null,
        profileImage: profileImageUrl
      });
  
      onClose();
    } catch (error) {
      alert("UPLOAD FAILED");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: dark ? '#000' : '#fff',
          border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '40px'
        }}
      >
        <div style={{
          fontSize: '16px',
          letterSpacing: '0.15em',
          marginBottom: '30px',
          color: dark ? '#fff' : '#000'
        }}>
          EDIT PROFILE
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px'
          }}>
            USERNAME
          </label>
          <div style={{
            fontSize: '13px',
            padding: '16px',
            border: `1px solid ${dark ? '#1a1a1a' : '#f5f5f5'}`,
            color: dark ? '#666' : '#999'
          }}>
            {user.username}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px'
          }}>
            BIO
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="TELL US ABOUT YOURSELF..."
            disabled={uploading}
            style={{
              width: '100%',
              minHeight: '100px',
              fontSize: '12px',
              letterSpacing: '0.02em',
              padding: '16px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              outline: 'none',
              resize: 'vertical',
              color: dark ? '#fff' : '#000',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          />
        </div>

        <div style={{ marginBottom: '30px' }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px'
          }}>
            PROFILE PICTURE
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            disabled={uploading}
            style={{
              fontSize: '11px',
              color: dark ? '#fff' : '#000',
              marginBottom: '12px'
            }}
          />
          {imagePreview && (
            <img
              src={imagePreview}
              style={{
                width: '120px',
                height: '120px',
                objectFit: 'cover',
                border: `1px solid ${dark ? '#333' : '#e5e5e5'}`
              }}
              alt="preview"
            />
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={uploading}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px 24px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              cursor: uploading ? 'not-allowed' : 'pointer',
              color: dark ? '#fff' : '#000',
              opacity: uploading ? 0.5 : 1,
              transition: 'border-color 0.2s'
            }}
            onMouseEnter={(e) => !uploading && (e.target.style.borderColor = dark ? '#666' : '#999')}
            onMouseLeave={(e) => !uploading && (e.target.style.borderColor = dark ? '#333' : '#e5e5e5')}
          >
            CANCEL
          </button>
          <button
            onClick={handleSave}
            disabled={uploading}
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '12px 24px',
              backgroundColor: dark ? '#fff' : '#000',
              border: 'none',
              cursor: uploading ? 'not-allowed' : 'pointer',
              color: dark ? '#000' : '#fff',
              opacity: uploading ? 0.5 : 1,
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => !uploading && (e.target.style.opacity = '0.8')}
            onMouseLeave={(e) => !uploading && (e.target.style.opacity = '1')}
          >
            {uploading ? 'SAVING...' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>
  );
}

