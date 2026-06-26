import React from 'react';
import { createRoot } from 'react-dom/client';
import { FlatPageEditorBridge } from './bridge.js';
import FlatPageEditorUI from './FlatPageEditorUI.jsx';
import './flat-editor.css';

function bootstrap() {
  const mountEl = document.createElement('div');
  mountEl.id = 'flat-page-editor-mount';
  document.body.appendChild(mountEl);

  const bridge = new FlatPageEditorBridge();

  try {
    const raw = localStorage.getItem('vr-hotspot-scenes-data');
    if (raw) {
      const data = JSON.parse(raw);
      if (data.flatPages) bridge.importProject(data.flatPages);
    }
  } catch (_) {}

  window.FlatPageEditor = FlatPageEditorBridge;
  window.flatPageEditor = bridge;

  createRoot(mountEl).render(<FlatPageEditorUI bridge={bridge} />);
}

if (document.body) {
  bootstrap();
} else {
  document.addEventListener('DOMContentLoaded', bootstrap);
}
