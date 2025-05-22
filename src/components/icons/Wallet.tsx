import _React from 'react'
import {Path, Svg} from 'react-native-svg'

// Map size presets to pixel values (prefix with _ to suppress unused warning)
const _sizeMap = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 28,
  xl: 32,
  '2xl': 40
}

export const Wallet_Stroke2_Corner2_Rounded = ({
  size = 'md',
  strokeWidth = 1.5,
}: {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  strokeWidth?: number
}) => {
  return (
    <Svg 
      width={typeof size === 'string' ? _sizeMap[size] : size} 
      height={typeof size === 'string' ? _sizeMap[size] : size} 
      viewBox="0 0 24 24"
    >
      <Path
        d="M19 7.5H5C3.89543 7.5 3 8.39543 3 9.5V17.5C3 18.6046 3.89543 19.5 5 19.5H19C20.1046 19.5 21 18.6046 21 17.5V9.5C21 8.39543 20.1046 7.5 19 7.5Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16.5 14.25C16.9142 14.25 17.25 13.9142 17.25 13.5C17.25 13.0858 16.9142 12.75 16.5 12.75C16.0858 12.75 15.75 13.0858 15.75 13.5C15.75 13.9142 16.0858 14.25 16.5 14.25Z"
        fill="currentColor"
      />
      <Path
        d="M3 10.5H15C15.8284 10.5 16.5 11.1716 16.5 12V12C16.5 12.8284 15.8284 13.5 15 13.5H3"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
