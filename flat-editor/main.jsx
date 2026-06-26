import React from 'react';
import { createRoot } from 'react-dom/client';
import { FlatPageEditorBridge } from './bridge.js';
import FlatPageEditorUI from './FlatPageEditorUI.jsx';
import { fetchDefaultTemplate } from './templates-api.js';
import { ADMIN_TEMPLATE_STORAGE_KEY } from './defaults.js';
import './flat-editor.css';

async function bootstrapStudentEditor() {
  const bridge = new FlatPageEditorBridge();

  try {
    const raw = localStorage.getItem('vr-hotspot-scenes-data');
    if (raw) {
      const data = JSON.parse(raw);
      if (data.flatPages) bridge.importProject(data.flatPages);
    }
  } catch (_) {}

  if (!bridge.hasContent()) {
    try {
      const defaultTpl = await fetchDefaultTemplate();
      if (defaultTpl) bridge.loadTemplate(defaultTpl);
    } catch (_) {}
  }

  return bridge;
}

async function bootstrapAdminTemplateEditor() {
  return new FlatPageEditorBridge({
    storageKey: ADMIN_TEMPLATE_STORAGE_KEY,
    adminTemplateMode: true,
    startVisible: true,
  });
}

async function bootstrap() {
  const mountEl = document.createElement('div');
  mountEl.id = 'flat-page-editor-mount';
  document.body.appendChild(mountEl);

  const boot = window.FLAT_EDITOR_BOOT || {};
  const isAdminTemplate = boot.mode === 'admin-template';
  const bridge = isAdminTemplate ? await bootstrapAdminTemplateEditor() : await bootstrapStudentEditor();

  window.FlatPageEditor = FlatPageEditorBridge;
  window.flatPageEditor = bridge;

  createRoot(mountEl).render(<FlatPageEditorUI bridge={bridge} />);

  window.dispatchEvent(new CustomEvent('flat-editor-ready', { detail: { bridge } }));
}

if (document.body) {
  bootstrap();
} else {
  document.addEventListener('DOMContentLoaded', bootstrap);
}
