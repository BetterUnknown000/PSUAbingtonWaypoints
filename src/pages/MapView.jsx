import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Pressable,
  Modal,
  Dimensions,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { Picker } from "@react-native-picker/picker";
import { useNavigation } from "@react-navigation/native";
import BottomMenu, { BOTTOM_MENU_HEIGHT } from "../components/BottomMenu";
import campusData from "../data/campusData.json";

const PSU = {
  blue: "#001E44",
  blue2: "#0B3D91",
  light: "#F5F7FA",
  border: "#E6ECF2",
  text: "#0B1220",
  muted: "#5B6776",
  white: "#FFFFFF",
};

const buildings = campusData.buildings.filter((b) =>
  ["woodland", "rydal", "sutherland", "lares", "springhouse", "athletic"].includes(b.id)
);

const MAP_W = 1481.3333;
const MAP_H = 1194.6667;

export default function MapView() {
  const navigation = useNavigation();

  const [selected, setSelected] = useState("");
  const [buildingModalOpen, setBuildingModalOpen] = useState(false);
  const [pendingBuildingId, setPendingBuildingId] = useState("");

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.id === selected) || null,
    [selected]
  );

  const openBuildingPicker = () => {
    setPendingBuildingId(selected || buildings[0]?.id || "");
    setBuildingModalOpen(true);
  };

  const confirmBuildingPicker = () => {
    setSelected(pendingBuildingId);
    setBuildingModalOpen(false);
  };

  const screenWidth = Dimensions.get("window").width;
  const panelInnerWidth = screenWidth - 40 - 36; // 20+20 margins, 18+18 panel padding
  const mapWidth = panelInnerWidth;
  const mapHeight = (mapWidth * MAP_H) / MAP_W;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View style={styles.psuBadge}>
            <Text style={styles.psuBadgeText}>PSU</Text>
          </View>
          <Text style={styles.brand}>PENN STATE ABINGTON</Text>
        </View>

        <Text style={styles.title}>
          Campus{"\n"}Map
        </Text>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Select a Building</Text>

          <Pressable style={styles.dropdownField} onPress={openBuildingPicker}>
            <Text
              style={[
                styles.dropdownValue,
                !selectedBuilding && styles.dropdownPlaceholder,
              ]}
            >
              {selectedBuilding?.name || "Select building"}
            </Text>
            <Text style={styles.dropdownChevron}>▾</Text>
          </Pressable>

          <Modal
            visible={buildingModalOpen}
            transparent
            animationType="slide"
            onRequestClose={() => setBuildingModalOpen(false)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setBuildingModalOpen(false)}>
                    <Text style={styles.modalCancel}>Cancel</Text>
                  </Pressable>

                  <Text style={styles.modalTitle}>Select Building</Text>

                  <Pressable onPress={confirmBuildingPicker}>
                    <Text style={styles.modalDone}>Done</Text>
                  </Pressable>
                </View>

                <Picker
                  selectedValue={pendingBuildingId}
                  onValueChange={(val) => setPendingBuildingId(val)}
                  style={styles.pickerIOS}
                  itemStyle={styles.pickerItemIOS}
                >
                  {buildings.map((b) => (
                    <Picker.Item
                      key={b.id}
                      label={b.name}
                      value={b.id}
                      color={PSU.text}
                    />
                  ))}
                </Picker>
              </View>
            </View>
          </Modal>

          <View
            style={[
              styles.mapContainer,
              { width: mapWidth, height: mapHeight },
            ]}
          >
            <Image
              source={require("../assets/psu-abington-map.jpeg")}
              style={{ width: mapWidth, height: mapHeight }}
              resizeMode="stretch"
            />

            <Svg
              width={mapWidth}
              height={mapHeight}
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              style={styles.mapOverlay}
            >
              <Path
                d="m 1074.9062,466.5519 71.6359,-91.1062 45.5531,32.69537 5.5105,-8.082 27.9196,27.55228 9.5515,37.47109 -27.9197,24.61337 -36.369,-42.61419 -14.3272,17.2661 9.9188,26.08282 -6.2451,6.97991 -23.5113,-2.57155 -4.4084,5.51046 19.4703,14.32718 -1.8368,26.45019 -12.123,10.28618 -5.8778,-3.67363 -9.9189,13.22509 6.9799,9.55145 -43.7162,40.04265 -27.1849,-23.87864 19.4702,-55.10456 19.8377,-15.42927 -23.1439,-19.10292 z"
                fill={selected === "sutherland" ? "rgba(30,64,124,0.35)" : "rgba(0,0,0,0.01)"}
                stroke={selected === "sutherland" ? "#ff0000" : "transparent"}
                strokeWidth={5}
                onPress={() => setSelected("sutherland")}
              />

              <Path
                d="m 628.92665,380.22143 10.28619,11.02091 14.69454,-15.06191 4.041,3.30627 21.3071,-15.79664 70.90119,-84.86101 0.36737,-12.123 43.71628,-65.39074 -8.81673,-14.69455 2.93891,-6.61255 19.10291,-0.36736 12.123,-15.06191 -0.73472,-8.44937 6.24518,-1.46945 V 91.840925 h -4.77573 l -0.73473,-9.551456 h -45.18573 l -0.73473,10.286183 -22.04182,7.347274 0.36736,8.816724 h -2.93891 l -4.041,-2.9389 -34.89955,47.02255 4.40836,2.57154 -0.73472,5.1431 -2.20418,0.36736 v 5.87782 l -2.57155,2.57155 v 3.30627 l -3.67364,2.20418 -0.36736,3.67364 10.28618,6.24518 -21.30709,37.83846 -20.57237,2.20418 v 8.08201 l 15.79664,40.77737 -4.77573,6.24518 2.20418,2.20418 -12.123,12.123 -4.40836,-2.20418 -9.91882,8.44937 0.36736,8.81672 -5.14309,3.30628 -0.36736,11.38827 -4.04101,4.40837 1.46946,1.83682 -15.06191,13.59245 -0.36737,10.65355 -5.14309,-0.36736 0.73473,4.77572 -8.082,10.65355 5.51045,5.14309 z"
                fill={selected === "woodland" ? "rgba(30,64,124,0.35)" : "rgba(0,0,0,0.01)"}
                stroke={selected === "woodland" ? "#ff0000" : "transparent"}
                strokeWidth={5}
                onPress={() => setSelected("woodland")}
              />

              <Path
                d="m 1014.6435,151.18344 -10.9101,13.5078 -15.58596,43.90035 3.37695,20.26169 17.40431,14.2871 2.5976,-3.11718 9.0918,7.53319 -0.2598,3.37695 8.0528,4.67578 1.8183,-1.5586 8.5723,5.71484 17.4043,7.5332 3.8964,-3.63672 40.0039,27.0156 9.0918,-10.13085 4.416,1.03906 4.6758,-4.41601 -3.1172,-4.67577 7.793,-8.05273 5.7148,3.37695 3.377,-1.29883 v -11.16991 l 3.6367,-2.85742 0.2597,-14.54686 3.8965,-0.25976 -0.2598,-2.85742 -3.6367,-1.29883 0.5196,-2.33789 2.8574,0.51953 v -8.83202 l -16.1055,-1.81836 -6.4941,-6.49413 -6.2344,1.29883 -52.4726,-41.3027 -6.4941,-0.25976 -28.834,-22.85935 z"
                fill={selected === "lares" ? "rgba(30,64,124,0.35)" : "rgba(0,0,0,0.01)"}
                stroke={selected === "lares" ? "#ff0000" : "transparent"}
                strokeWidth={5}
                onPress={() => setSelected("lares")}
              />

              <Path
                d="m 440.83644,474.26654 12.123,12.123 8.44937,-9.18409 7.34727,6.97991 28.65437,-29.02174 20.205,13.95982 18.00082,-15.42927 -14.32718,-16.53137 -5.87782,-21.30709 -22.04182,6.61254 -6.97991,-2.20418 -4.77573,4.40837 -5.51046,-2.57155 -3.67363,8.81673 -22.04182,11.75564 -1.46946,12.123 -5.14309,2.20418 2.20418,4.40837 z"
                fill={selected === "rydal" ? "rgba(30,64,124,0.35)" : "rgba(0,0,0,0.01)"}
                stroke={selected === "rydal" ? "#ff0000" : "transparent"}
                strokeWidth={5}
                onPress={() => setSelected("rydal")}
              />

              <Path
                d="m 881.67288,69.431739 24.61337,-4.408364 30.49118,8.449365 3.67364,-3.673637 4.77573,1.836818 1.46945,-3.673637 -4.041,-2.571546 2.20418,-9.918819 -31.22591,-9.91882 -1.83682,-4.775728 -5.87782,-0.367364 -4.40836,5.877819 -20.57237,0.734727 z"
                fill={selected === "springhouse" ? "rgba(30,64,124,0.35)" : "rgba(0,0,0,0.01)"}
                stroke={selected === "springhouse" ? "#ff0000" : "transparent"}
                strokeWidth={5}
                onPress={() => setSelected("springhouse")}
              />

              <Path
                d="m 557.6581,686.97012 77.8811,32.69537 1.10209,19.83764 3.67364,-0.73473 1.10209,5.87782 -71.26856,145.10866 -27.91964,-13.22509 3.30627,-9.1841 -38.57319,-15.79664 -19.10291,-9.18409 0.73473,-24.98073 z"
                fill={selected === "athletic" ? "rgba(30,64,124,0.35)" : "rgba(0,0,0,0.01)"}
                stroke={selected === "athletic" ? "#ff0000" : "transparent"}
                strokeWidth={5}
                onPress={() => setSelected("athletic")}
              />
            </Svg>
          </View>

          {!!selectedBuilding && (
            <View style={styles.mapSelectedBox}>
              <Text style={styles.mapSelectedName}>{selectedBuilding.name}</Text>

              <TouchableOpacity
                style={styles.primaryBtn}
                activeOpacity={0.9}
                onPress={() =>
                  navigation.navigate("FloorMap", { buildingId: selected })
                }
              >
                <Text style={styles.primaryBtnText}>View Floor Map →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      <BottomMenu navigation={navigation} active="Map" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PSU.light,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: BOTTOM_MENU_HEIGHT + 20,
  },
  brandRow: {
    paddingTop: 18,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  psuBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: PSU.blue2,
    alignItems: "center",
    justifyContent: "center",
  },
  psuBadgeText: {
    color: PSU.white,
    fontWeight: "900",
    fontSize: 12,
  },
  brand: {
    color: PSU.blue,
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 12,
  },
  title: {
    marginTop: 10,
    marginHorizontal: 20,
    fontSize: 38,
    fontWeight: "900",
    color: PSU.text,
    lineHeight: 42,
  },
  panel: {
    marginTop: 18,
    marginHorizontal: 20,
    backgroundColor: PSU.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: PSU.border,
    padding: 18,
    marginBottom: 18,
  },
  panelTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: PSU.text,
    marginBottom: 14,
  },
  dropdownField: {
    height: 54,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 14,
    backgroundColor: "#FBFCFE",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  dropdownValue: {
    color: PSU.text,
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    paddingRight: 12,
  },
  dropdownPlaceholder: {
    color: PSU.muted,
    fontWeight: "500",
  },
  dropdownChevron: {
    color: PSU.muted,
    fontSize: 18,
    fontWeight: "900",
  },
  mapContainer: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#EEF3F9",
    position: "relative",
    alignSelf: "center",
  },
  mapOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  mapSelectedBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(11,61,145,0.06)",
  },
  mapSelectedName: {
    fontSize: 18,
    fontWeight: "900",
    color: PSU.text,
  },
  primaryBtn: {
    marginTop: 10,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PSU.blue,
  },
  primaryBtnText: {
    color: PSU.white,
    fontSize: 16,
    fontWeight: "900",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.28)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: PSU.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 20,
  },
  modalHeader: {
    height: 54,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: PSU.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalCancel: {
    color: PSU.muted,
    fontWeight: "700",
    fontSize: 16,
  },
  modalTitle: {
    color: PSU.text,
    fontWeight: "900",
    fontSize: 16,
  },
  modalDone: {
    color: PSU.blue2,
    fontWeight: "900",
    fontSize: 16,
  },
  pickerIOS: {
    width: "100%",
    height: 220,
  },
  pickerItemIOS: {
    fontSize: 18,
  },
});
