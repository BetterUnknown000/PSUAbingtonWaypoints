import React, { useMemo, useState } from "react";
import {
  FlatList,
  Image,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  Dimensions,
} from "react-native";
import campusData from "../data/campusData.json";
import { findRoomsByBuilding } from "../utils/findRoom";
import BottomMenu from "../components/BottomMenu";

const PSU = {
  blue: "#001E44",
  blue2: "#0B3D91",
  light: "#F5F7FA",
  border: "#E6ECF2",
  text: "#0B1220",
  muted: "#5B6776",
  white: "#FFFFFF",
};

const { width } = Dimensions.get('window');

const BUILDING_DESCRIPTIONS = {
  sutherland:
    "Sutherland is a historic building designed by Julian Abele, featuring classrooms, academic advising, a tutoring center, the financial aid office, and a lecture hall in a converted indoor swimming pool.",
  lares: "Lares Building is the center of many student activities at Abington, housing the cafeteria, bookstore, student affairs, health & wellness office, and more. Events are held in Lubert Commons almost daily.",
  lionsgate:
    "Opened in 2017, LionsGate is the main residential facility, offering 400 beds in apartment-style units.",
  woodland: "Woodland Building is a central campus building with offices and academic space. It also contains the campus Library, Art Gallery, Woodland Cafe and computer labs.",
  springhouse:
    "Springhouse is the oldest building on campus. It contains classes, storage, and the Collegiate Recovery Program.",
  rydal: "Rydal is a building for classrooms and the campus security.",
  athletic: "The Athletics building features facilities for campus recreation and teams with a court, indoor gym, and certain self-defence classes.",
};

const BUILDING_IMAGES = {
  sutherland: [
    { id: '1', source: require("../assets/images/buildings/sutherland/sutherland.jpg") },
    { id: '2', source: require("../assets/images/buildings/sutherland/sutherland2.jpg")},
    { id: '3', source: require("../assets/images/buildings/sutherland/sutherland3.jpg")},
    { id: '4', source: require("../assets/images/buildings/sutherland/sutherland4.jpg")},
    { id: '5', source: require("../assets/images/buildings/sutherland/sutherland5.jpg")},
    { id: '6', source: require("../assets/images/buildings/sutherland/sutherland6.jpg")},
    { id: '7', source: require("../assets/images/buildings/sutherland/sutherland7.jpg")}
     ],
  lares: [
    { id: '1', source: require("../assets/images/buildings/lares/lares.jpg") },
    { id: '2', source: require("../assets/images/buildings/lares/lares2.jpg") },
    { id: '3', source: require("../assets/images/buildings/lares/lares3.jpg") },
    { id: '4', source: require("../assets/images/buildings/lares/lares4.jpg")},
    { id: '5', source: require("../assets/images/buildings/lares/lares5.jpg")},
    { id: '6', source: require("../assets/images/buildings/lares/lares6.jpg")},
    { id: '7', source: require("../assets/images/buildings/lares/lares7.jpeg")},
    { id: '8', source: require("../assets/images/buildings/lares/lares8.jpg")},
    ],
  woodland: [
    { id: '1', source: require("../assets/images/buildings/woodland/woodland.jpg") },
    { id: '2', source: require("../assets/images/buildings/woodland/woodland2.jpg") },
    { id: '3', source: require("../assets/images/buildings/woodland/woodland3.jpg") },
    { id: '4', source: require("../assets/images/buildings/woodland/woodland4.jpeg") },
    { id: '5', source: require("../assets/images/buildings/woodland/woodland5.jpeg") },
    { id: '6', source: require("../assets/images/buildings/woodland/woodland6.jpg") },
    { id: '7', source: require("../assets/images/buildings/woodland/woodland7.jpg") }
     ],
  springhouse: [
    { id: '1', source: require("../assets/images/buildings/springhouse/springhouse.jpg") },
    { id: '2', source: require("../assets/images/buildings/springhouse/springhouse2.jpg")},
    { id: '3', source: require("../assets/images/buildings/springhouse/springhouse3.jpeg")},
    { id: '4', source: require("../assets/images/buildings/springhouse/springhouse4.jpg")},
    { id: '5', source: require("../assets/images/buildings/springhouse/springhouse5.jpg")},
    { id: '6', source: require("../assets/images/buildings/springhouse/springhouse6.jpeg")}
],
  rydal: [
    { id: '1', source: require("../assets/images/buildings/rydal/rydal.jpg") },
    { id: '2', source: require("../assets/images/buildings/rydal/rydal2.jpeg") },
    { id: '3', source: require("../assets/images/buildings/rydal/rydal3.jpg") },
    { id: '4', source: require("../assets/images/buildings/rydal/rydal4.jpg") },
    { id: '5', source: require("../assets/images/buildings/rydal/rydal5.jpg") },

  ],
  athletic: [
    { id: '1', source: require("../assets/images/buildings/athletic/athletic.jpeg") },
    { id: '2', source: require("../assets/images/buildings/athletic/athletic2.jpeg") },
    { id: '3', source: require("../assets/images/buildings/athletic/athletic3.jpg")},
    { id: '4', source: require("../assets/images/buildings/athletic/athletic4.jpg")},
    { id: '5', source: require("../assets/images/buildings/athletic/athletic5.jpg")}
  ]
};

export default function BuildingDetail({ route, navigation }) {
  const { buildingId } = route.params || {};

  const building = useMemo(() => {
    const all = Array.isArray(campusData?.buildings) ? campusData.buildings : [];
    return (
      all.find(
        (b) =>
          String(b.id).toLowerCase() === String(buildingId || "").toLowerCase()
      ) || null
    );
  }, [buildingId]);

  const rooms = useMemo(() => findRoomsByBuilding(buildingId), [buildingId]);

  const images = BUILDING_IMAGES[String(buildingId || '').toLowerCase()] || [];
  const [activeIndex, setActiveIndex] = useState(0);

  const SLIDE_WIDTH = width - 40;

  const onScroll = (e) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SLIDE_WIDTH);
    setActiveIndex(index);
  };

  const description =
    BUILDING_DESCRIPTIONS[String(buildingId || "").toLowerCase()] ||
    "Information coming soon.";

  if (!building) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.page}>
          <View style={s.contentOnly}>
            <Text style={s.title}>Building not found</Text>
            <Text style={s.sub}>No data for: {String(buildingId)}</Text>
          </View>
          <BottomMenu navigation={navigation} active="Buildings" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.page}>
        <ScrollView
          style={s.content}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          <Text style={s.title}>{building.name}</Text>
          <Text style={s.sub}>ID: {building.id}</Text>

          <View style={s.slideshowContainer}>
            <FlatList
                data={images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={onScroll}
                scrollEventThrottle={16}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <Image source={ item.source } style={s.image} />
                )}
            />
            <View style={s.dots}>
              {images.map((_, i) => (
                  <View key={i} style={[s.dot, i === activeIndex && s.activeDot]} />
              ))}
            </View>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>About This Building</Text>
            <Text style={s.row}>{description}</Text>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Location</Text>
            <Text style={s.row}>Latitude: {building.latitude ?? "N/A"}</Text>
            <Text style={s.row}>Longitude: {building.longitude ?? "N/A"}</Text>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Floors</Text>
            {Array.isArray(building.floors) && building.floors.length > 0 ? (
              building.floors.map((f) => (
                <Text key={String(f)} style={s.bullet}>
                  • Floor {String(f)}
                </Text>
              ))
            ) : (
              <Text style={s.row}>N/A</Text>
            )}
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Entrances (Waypoints)</Text>
            {Array.isArray(building.entrances) && building.entrances.length > 0 ? (
              building.entrances.map((e) => (
                <Text key={String(e)} style={s.bullet}>
                  • {String(e)}
                </Text>
              ))
            ) : (
              <Text style={s.row}>N/A</Text>
            )}
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Room Count</Text>
            <Text style={s.row}>{rooms.length} rooms found in dataset.</Text>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Quick Navigation</Text>
            <Text style={s.row}>
              Search for a specific room from the main page, then start navigation.
            </Text>

            <Pressable
              style={s.btn}
              onPress={() => navigation.navigate("Search")}
            >
              <Text style={s.btnText}>Go to Search</Text>
            </Pressable>
          </View>
        </ScrollView>

        <BottomMenu navigation={navigation} active="Buildings" />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PSU.light },
  page: { flex: 1, backgroundColor: PSU.light },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  contentOnly: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: { fontSize: 28, fontWeight: "900", color: PSU.text },
  sub: { marginTop: 6, color: PSU.muted },

  section: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 16,
    padding: 14,
    backgroundColor: PSU.white,
  },

  sectionTitle: { fontSize: 16, fontWeight: "900", color: PSU.text },
  row: { marginTop: 8, color: "#334155", lineHeight: 20 },
  bullet: { marginTop: 8, color: "#334155" },

  image: { width: width - 40, height: 200, resizeMode: 'cover' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 8, paddingBottom: 8, backgroundColor: PSU.white },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PSU.border, margin: 4 },
  activeDot: { backgroundColor: PSU.blue },

  btn: {
    marginTop: 14,
    height: 46,
    borderRadius: 14,
    backgroundColor: PSU.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    color: PSU.white,
    fontWeight: "900",
  },
  slideshowContainer: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
});
