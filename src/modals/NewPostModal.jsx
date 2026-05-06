import React, { useState } from "react";

export default function NewPostModal({ onClose, onPost, dark }) {
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
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

  const handleSubmit = async () => {
    if (!text.trim() && !imageFile && !videoUrl && !audioUrl) {
      alert("PLEASE ADD SOME CONTENT");
      return;
    }

    setUploading(true);
    try {
      let imageUrl = null;
      if (imageFile) {
        imageUrl = await uploadImageToMinIO(imageFile);
      }

      onPost({
        text: text.trim(),
        image: imageUrl,
        videoUrl: videoUrl.trim() || null,
        audioUrl: audioUrl.trim() || null
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
          maxWidth: '600px',
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
          NEW POST
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="WHAT'S ON YOUR MIND?"
          disabled={uploading}
          style={{
            width: '100%',
            minHeight: '120px',
            fontSize: '13px',
            letterSpacing: '0.02em',
            padding: '16px',
            marginBottom: '20px',
            background: 'none',
            border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
            outline: 'none',
            resize: 'vertical',
            color: dark ? '#fff' : '#000',
            fontFamily: 'Helvetica Neue, Arial, sans-serif'
          }}
        />

        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px'
          }}>
            IMAGE
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            disabled={uploading}
            style={{
              fontSize: '11px',
              color: dark ? '#fff' : '#000'
            }}
          />
          {imagePreview && (
            <img
              src={imagePreview}
              style={{
                width: '100%',
                maxHeight: '300px',
                objectFit: 'contain',
                marginTop: '12px'
              }}
              alt="preview"
            />
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: dark ? '#999' : '#666',
            marginBottom: '8px'
          }}>
            VIDEO URL (YOUTUBE OR DIRECT LINK)
          </label>
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://..."
            disabled={uploading}
            style={{
              width: '100%',
              fontSize: '12px',
              padding: '12px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              outline: 'none',
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
            AUDIO URL
          </label>
          <input
            type="text"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            placeholder="https://..."
            disabled={uploading}
            style={{
              width: '100%',
              fontSize: '12px',
              padding: '12px',
              background: 'none',
              border: `1px solid ${dark ? '#333' : '#e5e5e5'}`,
              outline: 'none',
              color: dark ? '#fff' : '#000',
              fontFamily: 'Helvetica Neue, Arial, sans-serif'
            }}
          />
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
            onClick={handleSubmit}
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
            {uploading ? 'UPLOADING...' : 'POST'}
          </button>
        </div>
      </div>
    </div>
  );
}

