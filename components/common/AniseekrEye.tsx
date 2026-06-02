import Svg, { Path, Circle } from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

// Aniseekr brand eye logo. Pure stroke + filled pupil + four-direction rays.
// Mirrors the iOS asset (aniseekr_eye.svg, 120×120) so the splash on both
// platforms reads as the same mark.
export function AniseekrEye({ size = 120, color = '#FFFFFF', strokeWidth = 4 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <Path
        d="M60 20C30 20 10 60 10 60C10 60 30 100 60 100C90 100 110 60 110 60C110 60 90 20 60 20Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={60} cy={60} r={25} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={60} cy={60} r={12} fill={color} />
      <Path
        d="M60 5V15M60 105V115M115 60H105M15 60H5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}
