export const themes = {
  default: {
    bg: { light: '#fff', dark: '#000' },
    text: { light: '#000', dark: '#fff' },
    textMuted: { light: '#666', dark: '#999' },
    textDim: { light: '#999', dark: '#666' },
    border: { light: '#e5e5e5', dark: '#333' },
    borderDim: { light: '#f5f5f5', dark: '#1a1a1a' },
    bgAlt: { light: '#fafafa', dark: '#0a0a0a' }
  },
  serika: {
    bg: { light: '#e2b714', dark: '#323437' },
    text: { light: '#323437', dark: '#e2b714' },
    textMuted: { light: '#646669', dark: '#d1d0c5' },
    textDim: { light: '#969696', dark: '#646669' },
    border: { light: '#d1d0c5', dark: '#646669' },
    borderDim: { light: '#e8e6d5', dark: '#2c2e31' },
    bgAlt: { light: '#f5f3e8', dark: '#2c2e31' }
  },
  retrocast: {
    bg: { light: '#fefcfd', dark: '#2e2f33' },
    text: { light: '#2e2f33', dark: '#d6d5c9' },
    textMuted: { light: '#66646d', dark: '#a39e95' },
    textDim: { light: '#b3b1ba', dark: '#66646d' },
    border: { light: '#d6d5c9', dark: '#545557' },
    borderDim: { light: '#e8e7e1', dark: '#3d3e42' },
    bgAlt: { light: '#f5f4ed', dark: '#3d3e42' }
  },
  botanical: {
    bg: { light: '#f1f4e8', dark: '#1d2516' },
    text: { light: '#1d2516', dark: '#d0daba' },
    textMuted: { light: '#5a6749', dark: '#a8b491' },
    textDim: { light: '#9ba88a', dark: '#5a6749' },
    border: { light: '#c5d1b0', dark: '#4a5438' },
    borderDim: { light: '#e0e8d4', dark: '#2a3120' },
    bgAlt: { light: '#e8edd9', dark: '#2a3120' }
  },
  ocean: {
    bg: { light: '#e8f4f8', dark: '#16232e' },
    text: { light: '#16232e', dark: '#cad9e0' },
    textMuted: { light: '#4a6b7c', dark: '#96b1bf' },
    textDim: { light: '#8aa6b5', dark: '#4a6b7c' },
    border: { light: '#b3cdd9', dark: '#2d4a5c' },
    borderDim: { light: '#d9e8ef', dark: '#1d3240' },
    bgAlt: { light: '#dceaf2', dark: '#1d3240' }
  },
  rose: {
    bg: { light: '#fef3f4', dark: '#2e1e1f' },
    text: { light: '#2e1e1f', dark: '#f0d4d7' },
    textMuted: { light: '#8a5f64', dark: '#d4a3a8' },
    textDim: { light: '#c4a1a6', dark: '#8a5f64' },
    border: { light: '#e8c4c8', dark: '#5a3b3f' },
    borderDim: { light: '#f5e0e3', dark: '#3d2a2c' },
    bgAlt: { light: '#f9e6e9', dark: '#3d2a2c' }
  }
};

export function makeGetColor(theme, dark) {
  return (colorKey) => {
    const current = themes[theme] || themes.default;
    const mode = dark ? 'dark' : 'light';
    return current[colorKey]?.[mode] || '#000';
  };
}
