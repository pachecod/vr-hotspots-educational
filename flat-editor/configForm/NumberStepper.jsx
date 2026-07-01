import React from 'react';

function decimalPlaces(step) {
  const parts = String(step).split('.');
  return parts.length > 1 ? parts[1].length : 0;
}

function coerceNumber(value, fallback = 0) {
  if (value === '' || value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function inferNumberStep(field, value) {
  if (field?.step != null && field.step !== '') return Number(field.step) || 1;
  const key = String(field?.path || '').split('.').pop() || '';
  if (/intensity|opacity|brightness|tiling/i.test(key)) return 0.1;
  if (/rotation/i.test(key)) return 1;
  if (/position|scale|size|radius|width|height/i.test(key)) return 0.1;
  const n = coerceNumber(value, null);
  if (n != null && Number.isInteger(n)) return 1;
  return 0.1;
}

export default function NumberStepper({
  id,
  label,
  value,
  onChange,
  step,
  min,
  max,
  help,
}) {
  const stepNum = Number(step) || 1;
  const places = decimalPlaces(stepNum);

  const applyDelta = (delta) => {
    let next = coerceNumber(value, 0) + delta;
    if (min != null && min !== '') next = Math.max(Number(min), next);
    if (max != null && max !== '') next = Math.min(Number(max), next);
    if (places > 0) next = Number(next.toFixed(places));
    onChange(next);
  };

  const handleInput = (raw) => {
    if (raw === '') {
      onChange('');
      return;
    }
    const n = Number(raw);
    onChange(Number.isFinite(n) ? n : raw);
  };

  return (
    <div className="cfg-form-group">
      <label htmlFor={id}>{label}</label>
      <div className="cfg-number-stepper">
        <input
          id={id}
          type="number"
          className="cfg-input cfg-number-input"
          value={value ?? ''}
          step={stepNum}
          min={min}
          max={max}
          onChange={(e) => handleInput(e.target.value)}
        />
        <div className="cfg-number-arrows" aria-hidden="true">
          <button
            type="button"
            className="cfg-number-arrow cfg-number-arrow-up"
            tabIndex={-1}
            aria-label={`Increase ${label}`}
            onClick={() => applyDelta(stepNum)}
          >
            ▴
          </button>
          <button
            type="button"
            className="cfg-number-arrow cfg-number-arrow-down"
            tabIndex={-1}
            aria-label={`Decrease ${label}`}
            onClick={() => applyDelta(-stepNum)}
          >
            ▾
          </button>
        </div>
      </div>
      {help && <p className="cfg-help">{help}</p>}
    </div>
  );
}
