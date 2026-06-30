import React, { useCallback, useMemo } from 'react';
import { getPath, setPath, joinPath } from './configPathUtils.js';
import { fieldAssetCategory } from './inferFieldType.js';
import { loadUiSchema } from './loadUiSchema.js';
import { assetUrlForPreview } from '../resolveConfigAssetUrls.js';
import './config-form.css';

function browseAsset(category, onUrl) {
  if (!window.CommonAssetsPicker) {
    alert('Online assets picker is not available.');
    return;
  }
  window.CommonAssetsPicker.openFor({
    category: category || 'images',
    onSelect: (asset) => {
      const url = assetUrlForPreview(asset);
      if (url) onUrl(url);
    },
  });
}

function ConfigField({ field, fullPath, value, onChange }) {
  const id = `cfg-${fullPath.replace(/[^a-z0-9]+/gi, '-')}`;

  const handleChange = (next) => {
    onChange(fullPath, next);
  };

  if (field.type === 'boolean') {
    return (
      <div className="cfg-form-group">
        <label className="cfg-checkbox-label" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={!!value}
            onChange={(e) => handleChange(e.target.checked)}
          />
          <span>{field.label}</span>
        </label>
      </div>
    );
  }

  if (field.type === 'color') {
    return (
      <div className="cfg-form-group">
        <label htmlFor={id}>{field.label}</label>
        <div className="cfg-color-row">
          <input
            id={id}
            type="color"
            value={String(value || '#000000').startsWith('#') ? value : '#000000'}
            onChange={(e) => handleChange(e.target.value)}
          />
          <input
            type="text"
            className="cfg-input"
            value={value ?? ''}
            onChange={(e) => handleChange(e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (field.type === 'number') {
    return (
      <div className="cfg-form-group">
        <label htmlFor={id}>{field.label}</label>
        <input
          id={id}
          type="number"
          className="cfg-input"
          value={value ?? ''}
          onChange={(e) => handleChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div className="cfg-form-group">
        <label htmlFor={id}>{field.label}</label>
        <textarea
          id={id}
          className="cfg-textarea"
          rows={4}
          value={value ?? ''}
          onChange={(e) => handleChange(e.target.value)}
        />
        {field.help && <p className="cfg-help">{field.help}</p>}
      </div>
    );
  }

  if (field.type === 'url') {
    const category = fieldAssetCategory(field);
    return (
      <div className="cfg-form-group">
        <label htmlFor={id}>{field.label}</label>
        <input
          id={id}
          type="url"
          className="cfg-input"
          value={value ?? ''}
          placeholder="https://…"
          onChange={(e) => handleChange(e.target.value)}
        />
        <button
          type="button"
          className="cfg-btn-browse"
          onClick={() => browseAsset(category, (url) => handleChange(url))}
        >
          Browse Online Assets
        </button>
        {field.help && <p className="cfg-help">{field.help}</p>}
      </div>
    );
  }

  return (
    <div className="cfg-form-group">
      <label htmlFor={id}>{field.label}</label>
      <input
        id={id}
        type="text"
        className="cfg-input"
        value={value ?? ''}
        onChange={(e) => handleChange(e.target.value)}
      />
      {field.help && <p className="cfg-help">{field.help}</p>}
    </div>
  );
}

function ConfigSection({ section, config, onFieldChange }) {
  const repeat = section.repeat;

  if (repeat?.path) {
    const items = getPath(config, repeat.path);
    if (!Array.isArray(items)) return null;

    return (
      <div className="cfg-section">
        <h3 className="cfg-section-title">{section.title}</h3>
        {items.map((item, index) => {
          const itemLabel =
            (repeat.itemLabel && item[repeat.itemLabel]) ||
            item.name ||
            item.id ||
            `${section.title} ${index + 1}`;
          return (
            <div key={`${repeat.path}-${index}`} className="cfg-repeat-block">
              <h4 className="cfg-repeat-title">{itemLabel}</h4>
              {(section.fields || []).map((field) => {
                const fullPath = joinPath(`${repeat.path}.${index}`, field.path);
                return (
                  <ConfigField
                    key={fullPath}
                    field={field}
                    fullPath={fullPath}
                    value={getPath(config, fullPath)}
                    onChange={onFieldChange}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="cfg-section">
      <h3 className="cfg-section-title">{section.title}</h3>
      {(section.fields || []).map((field) => (
        <ConfigField
          key={field.path}
          field={field}
          fullPath={field.path}
          value={getPath(config, field.path)}
          onChange={onFieldChange}
        />
      ))}
    </div>
  );
}

export default function ConfigFormPanel({ bridge, onUpdated }) {
  const configJsonRaw = bridge.getFileContent('config.json');
  const configUiRaw = bridge.getFileContent('config.ui.json');
  const configResult = useMemo(() => bridge.getConfigObject(), [bridge, configJsonRaw]);
  const schema = useMemo(() => loadUiSchema(bridge), [bridge, configJsonRaw, configUiRaw]);

  const handleFieldChange = useCallback(
    (path, value) => {
      const current = bridge.getConfigObject();
      if (!current.ok || !current.data) return;
      const next = JSON.parse(JSON.stringify(current.data));
      setPath(next, path, value);
      bridge.setConfigObject(next);
      onUpdated?.();
    },
    [bridge, onUpdated]
  );

  if (!configResult.ok) {
    return (
      <div className="cfg-panel cfg-panel-error">
        <p>Invalid JSON in config.json — fix syntax in Code mode first.</p>
        <p className="cfg-help">{configResult.error}</p>
      </div>
    );
  }

  if (!schema?.sections?.length) {
    return (
      <div className="cfg-panel cfg-panel-empty">
        <p>No visual editor schema found.</p>
        <p className="cfg-help">
          Add a <code>config.ui.json</code> file to this template, or use Code mode to edit{' '}
          <code>config.json</code> directly.
        </p>
      </div>
    );
  }

  const config = configResult.data;

  return (
    <div className="cfg-panel">
      <p className="cfg-panel-intro">
        Edit template settings below. Changes save to <code>config.json</code> and update the live
        preview.
      </p>
      {schema.sections.map((section, i) => (
        <ConfigSection
          key={`${section.title}-${i}`}
          section={section}
          config={config}
          onFieldChange={handleFieldChange}
        />
      ))}
    </div>
  );
}
