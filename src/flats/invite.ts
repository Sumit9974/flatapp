import { Share } from 'react-native';

export function inviteMessage(flatName: string, inviteCode: string): string {
  return `Join our flat "${flatName}" on FlatApp. Open the app, choose Join with an invite code and enter ${inviteCode}.`;
}

export function shareInvite(flatName: string, inviteCode: string): void {
  void Share.share({ message: inviteMessage(flatName, inviteCode) });
}
