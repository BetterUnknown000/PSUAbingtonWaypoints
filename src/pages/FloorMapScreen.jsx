import React, { useMemo, useState } from "react";
import { ScrollView, View, Text, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BottomMenu from "../components/BottomMenu";
import { useBottomMenuSpacing } from "../utils/useBottomMenuSpacing";
import { getFloorPlanConfig } from "../data/floorPlans";

const PSU = {
  blue: "#001E44",
  light: "#F5F7FA",
  border: "#E6ECF2",
  text: "#0B1220",
  muted: "#5B6776",
  white: "#FFFFFF",
};

export default function FloorMapScreen({ route, navigation }) {
  const { buildingId } = route.params || {};
  const config = useMemo(() => getFloorPlanConfig(buildingId), [buildingId]);
  const [selectedFloorId, setSelectedFloorId] = useState(
    config?.floors?.[0]?.id || ""
  );

  const selectedFloor = useMemo(() => {
    return (
      config?.floors?.find((floor) => floor.id === selectedFloorId) ||
      config?.floors?.[0] ||
      null
    );
  }, [config, selectedFloorId]);

  const SelectedPlan = selectedFloor?.component || null;
  const { scrollContentStyle } = useBottomMenuSpacing(28);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.page}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={scrollContentStyle}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Floor Plans</Text>
          <Text style={styles.subtitle}>
            {config?.buildingName || `Building: ${buildingId}`}
          </Text>

          {!config ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Floor plans not available</Text>
              <Text style={styles.emptyText}>
                This building does not have imported floor plans yet.
              </Text>
            </View>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {config.floors.map((floor) => (
                  <Pressable
                    key={floor.id}
                    style={[
                      styles.chip,
                      floor.id === selectedFloor?.id && styles.chipActive,
                    ]}
                    onPress={() => setSelectedFloorId(floor.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        floor.id === selectedFloor?.id && styles.chipTextActive,
                      ]}
                    >
                      {floor.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.planCard}>
                <Text style={styles.planTitle}>{selectedFloor?.label}</Text>
                <View style={styles.planCanvas}>
                  {SelectedPlan ? <SelectedPlan width="100%" height="100%" /> : null}
                </View>
              </View>
            </>
          )}
        </ScrollView>

        <BottomMenu navigation={navigation} active="Map" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PSU.light,
  },
  page: {
    flex: 1,
    backgroundColor: PSU.light,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: PSU.light,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: PSU.blue,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 18,
    color: PSU.muted,
  },
  chipRow: {
    gap: 10,
    paddingTop: 18,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PSU.border,
    backgroundColor: PSU.white,
  },
  chipActive: {
    backgroundColor: PSU.blue,
    borderColor: PSU.blue,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "700",
    color: PSU.text,
  },
  chipTextActive: {
    color: PSU.white,
  },
  planCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PSU.border,
    backgroundColor: PSU.white,
  },
  planTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: PSU.text,
    marginBottom: 12,
  },
  planCanvas: {
    height: 520,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#FBFCFE",
    borderWidth: 1,
    borderColor: PSU.border,
  },
  emptyCard: {
    marginTop: 18,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PSU.border,
    backgroundColor: PSU.white,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: PSU.text,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: PSU.muted,
  },
});
