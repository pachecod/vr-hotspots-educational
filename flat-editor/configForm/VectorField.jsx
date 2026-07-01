import React from 'react';
import NumberStepper, { inferNumberStep } from './NumberStepper.jsx';
import { parseAframeVector, formatAframeVector, vectorAxisLabels } from './vectorUtils.js';

export default function VectorField({ id, label, value, components = 3, field, help, onChange }) {
  const parts = parseAframeVector(value, components);
  const axes = vectorAxisLabels(components);

  const handleAxisChange = (index, nextVal) => {
    const next = [...parts];
    if (nextVal === '' || nextVal == null) {
      next[index] = 0;
    } else {
      const n = Number(nextVal);
      next[index] = Number.isFinite(n) ? n : 0;
    }
    onChange(formatAframeVector(next));
  };

  return (
    <div className="cfg-form-group cfg-vector-group">
      <span className="cfg-vector-label">{label}</span>
      <div className={`cfg-vector-row cfg-vector-row-${components}`}>
        {axes.map((axis, index) => (
          <NumberStepper
            key={axis}
            compact
            id={`${id}-${axis.toLowerCase()}`}
            label={axis}
            value={parts[index]}
            step={inferNumberStep(
              { ...field, path: `${field?.path || ''}.${axis}` },
              parts[index]
            )}
            onChange={(v) => handleAxisChange(index, v)}
          />
        ))}
      </div>
      {help && <p className="cfg-help">{help}</p>}
    </div>
  );
}
