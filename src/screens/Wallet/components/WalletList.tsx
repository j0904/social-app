import React from 'react';
import {View} from 'react-native';

interface Props {
  children: React.ReactNode;
}

export function WalletList({children}: Props) {
  return (
    <View style={{padding: 16, gap: 12}}>
      {children}
    </View>
  );
}
