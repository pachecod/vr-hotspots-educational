import React, { useEffect, useState } from 'react';

/**
 * Animated purple car + VR headset mascot for Ridey (ported from webxride-2-auth).
 */
export default function RideyIcon({
  isThinking = false,
  isHappy = false,
  isConfused = false,
  size = 60,
  className = '',
}) {
  const uid = React.useId().replace(/:/g, '');
  const [eyeBlink, setEyeBlink] = useState(false);
  const [bounce, setBounce] = useState(false);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setEyeBlink(true);
      setTimeout(() => setEyeBlink(false), 150);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(blinkInterval);
  }, []);

  useEffect(() => {
    if (!isThinking) {
      setBounce(false);
      return undefined;
    }
    setBounce(true);
    const bounceInterval = setInterval(() => {
      setBounce(true);
      setTimeout(() => setBounce(false), 600);
    }, 1200);
    return () => clearInterval(bounceInterval);
  }, [isThinking]);

  const getMouthExpression = () => {
    if (isHappy) return 'smile';
    if (isConfused) return 'confused';
    if (isThinking) return 'thinking';
    return 'neutral';
  };

  const mouth = getMouthExpression();
  const pupilClass = eyeBlink ? 'flat-ridey-eye-blink' : '';

  return (
    <div
      className={`flat-ridey-icon ${bounce ? 'flat-ridey-icon-bounce' : ''} ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size} height={size} viewBox="0 0 100 100" className="flat-ridey-icon-svg">
        <defs>
          <linearGradient id={`${uid}-car`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="30%" stopColor="#7C3AED" />
            <stop offset="70%" stopColor="#6D28D9" />
            <stop offset="100%" stopColor="#5B21B6" />
          </linearGradient>
          <linearGradient id={`${uid}-highlight`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id={`${uid}-eye`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#F8FAFC" />
          </linearGradient>
          <linearGradient id={`${uid}-vr`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#374151" />
            <stop offset="100%" stopColor="#1F2937" />
          </linearGradient>
          <linearGradient id={`${uid}-wheel`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6B7280" />
            <stop offset="100%" stopColor="#374151" />
          </linearGradient>
        </defs>

        <ellipse cx="50" cy="88" rx="28" ry="6" fill="#000000" opacity="0.2" />

        <ellipse cx="50" cy="60" rx="28" ry="18" fill={`url(#${uid}-car)`} stroke="#4C1D95" strokeWidth="1" />
        <ellipse cx="25" cy="60" rx="12" ry="18" fill={`url(#${uid}-car)`} stroke="#4C1D95" strokeWidth="1" />
        <ellipse cx="75" cy="60" rx="12" ry="18" fill={`url(#${uid}-car)`} stroke="#4C1D95" strokeWidth="1" />
        <ellipse cx="50" cy="50" rx="20" ry="12" fill={`url(#${uid}-highlight)`} stroke="none" />

        <circle cx="30" cy="75" r="8" fill={`url(#${uid}-wheel)`} stroke="#1F2937" strokeWidth="1" />
        <circle cx="70" cy="75" r="8" fill={`url(#${uid}-wheel)`} stroke="#1F2937" strokeWidth="1" />
        <circle cx="30" cy="75" r="5" fill="#4B5563" />
        <circle cx="70" cy="75" r="5" fill="#4B5563" />
        <circle cx="30" cy="75" r="2" fill="#6B7280" />
        <circle cx="70" cy="75" r="2" fill="#6B7280" />

        <g transform="translate(35, 45)">
          <ellipse cx="8" cy="8" rx="6" ry="8" fill={`url(#${uid}-eye)`} stroke="#D1D5DB" strokeWidth="1.5" />
          <ellipse cx="22" cy="8" rx="6" ry="8" fill={`url(#${uid}-eye)`} stroke="#D1D5DB" strokeWidth="1.5" />
          <circle
            cx={8 + (isConfused ? 1 : 0)}
            cy={8 + (isConfused ? 1 : 0)}
            r="3"
            fill="#1F2937"
            className={pupilClass}
          />
          <circle
            cx={22 + (isConfused ? 1 : 0)}
            cy={8 + (isConfused ? 1 : 0)}
            r="3"
            fill="#1F2937"
            className={pupilClass}
          />
          <circle cx="9" cy="6" r="1.5" fill="#FFFFFF" opacity="0.9" />
          <circle cx="23" cy="6" r="1.5" fill="#FFFFFF" opacity="0.9" />
        </g>

        <g transform={`translate(35, 38)${isConfused ? ' rotate(12 15 2)' : ''}`}>
          <path
            d="M 2 2 Q 8 -1 14 2"
            stroke="#1F2937"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
        </g>
        <g transform={`translate(35, 38)${isConfused ? ' rotate(-12 15 2)' : ''}`}>
          <path
            d="M 16 2 Q 22 -1 28 2"
            stroke="#1F2937"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
        </g>

        <g transform="translate(35, 58)">
          {mouth === 'smile' && (
            <path d="M 5 0 Q 15 8 25 0" stroke="#1F2937" strokeWidth="3" fill="none" strokeLinecap="round" />
          )}
          {mouth === 'confused' && (
            <path d="M 8 0 Q 15 -2 22 0" stroke="#1F2937" strokeWidth="3" fill="none" strokeLinecap="round" />
          )}
          {mouth === 'thinking' && <ellipse cx="15" cy="2" rx="4" ry="2" fill="#1F2937" />}
          {mouth === 'neutral' && (
            <path d="M 8 0 Q 15 3 22 0" stroke="#1F2937" strokeWidth="3" fill="none" strokeLinecap="round" />
          )}
        </g>

        <ellipse cx="50" cy="70" rx="20" ry="3" fill="#9CA3AF" stroke="#6B7280" strokeWidth="0.5" />

        <g transform="translate(35, 15)">
          <ellipse cx="15" cy="15" rx="20" ry="12" fill={`url(#${uid}-vr)`} stroke="#111827" strokeWidth="1.5" />
          <path d="M 5 15 Q 15 5 25 15 Q 15 25 5 15" fill="none" stroke="#111827" strokeWidth="2" />
          <ellipse cx="10" cy="15" rx="7" ry="5" fill="#000000" />
          <ellipse cx="20" cy="15" rx="7" ry="5" fill="#000000" />
          <ellipse cx="10" cy="13" rx="2" ry="1.5" fill="#FFFFFF" opacity="0.6" />
          <ellipse cx="20" cy="13" rx="2" ry="1.5" fill="#FFFFFF" opacity="0.6" />
        </g>

        {isThinking && (
          <g transform="translate(50, 8)">
            <circle cx="0" cy="0" r="1.5" fill="#8B5CF6" opacity="0.6">
              <animate attributeName="opacity" values="0.6;1;0.6" dur="1s" repeatCount="indefinite" />
            </circle>
            <circle cx="6" cy="0" r="1.5" fill="#8B5CF6" opacity="0.6">
              <animate attributeName="opacity" values="0.6;1;0.6" dur="1s" begin="0.3s" repeatCount="indefinite" />
            </circle>
            <circle cx="12" cy="0" r="1.5" fill="#8B5CF6" opacity="0.6">
              <animate attributeName="opacity" values="0.6;1;0.6" dur="1s" begin="0.6s" repeatCount="indefinite" />
            </circle>
          </g>
        )}

        {isHappy && (
          <g>
            <circle cx="15" cy="20" r="1" fill="#FCD34D" opacity="0.8">
              <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="85" cy="25" r="1" fill="#FCD34D" opacity="0.8">
              <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" begin="0.5s" repeatCount="indefinite" />
            </circle>
            <circle cx="10" cy="35" r="1" fill="#FCD34D" opacity="0.8">
              <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" begin="1s" repeatCount="indefinite" />
            </circle>
            <circle cx="90" cy="40" r="1" fill="#FCD34D" opacity="0.8">
              <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" begin="1.5s" repeatCount="indefinite" />
            </circle>
          </g>
        )}
      </svg>
    </div>
  );
}
