import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function FloorMapScreen({ route }) {
  const { buildingId } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Floor Maps</Text>
      <Text style={styles.subtitle}>Building: {buildingId}</Text>

      {/* later: show SVG floor maps here */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fb",
    padding: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#001E44",
  },
  subtitle: {
    marginTop: 10,
    fontSize: 18,
    color: "#506070",
  },
});