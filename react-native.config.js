// npm installs these as optional peers of expo-router (they serve its Drawer layout and JS stack).
// FlatApp uses the native Stack and Tabs only, so they stay out of the native build: together they
// produced ~3 GB of build output, enough to fill drive D:, and several extra minutes per build.
// Remove an entry here if a screen ever needs that library.
module.exports = {
  dependencies: {
    'react-native-reanimated': { platforms: { android: null, ios: null } },
    'react-native-worklets': { platforms: { android: null, ios: null } },
    'react-native-gesture-handler': { platforms: { android: null, ios: null } },
  },
};
