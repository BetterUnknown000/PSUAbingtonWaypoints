import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    Dimensions,
    Linking
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BottomMenu from "../components/BottomMenu";
import { useBottomMenuSpacing } from "../utils/useBottomMenuSpacing";

const PSU = {
    blue: "#001E44",
    blue2: "#0B3D91",
    accent: "#1D6FCC",
    light: "#F5F7FA",
    border: "#E6ECF2",
    text: "#0B1220",
    muted: "#5B6776",
    white: "#FFFFFF",
    cardBg: "#FFFFFF",
    tagBg: "#EAF1FB",
    tagText: "#0B3D91",
};

const { width } = Dimensions.get("window");

const FAQS = [
    {
        q: "What does the bottom menu include?",
        a: "The bottom menu guides you to five features:\n\n• Map — an interactive campus map\n• Schedule — save and view your course schedules\n• Buildings — browse buildings and tap one for details\n• Main Page — search for a classroom and get directions\n• Help — this page",
    },
    {
        q: "How can this app guide me to my class?",
        a: "From the main page screen, search for the room number or course number. Once found, tap \"Search\", confirm it is correct, then tap \"Go\" and the app will guide you to the correct building and room.",
    },
    {
        q: "Why was I not able to find my class?",
        a: "Double-check that you entered the correct room number or course number. Some courses use specific course numbers and sections (CMPSC 460-001). If the room still doesn't appear, it may not yet be in our database — ask someone for help for the physical location.",
    },
    {
        q: "Why do I need to scan a QR code?",
        a: "QR codes are posted at building entrances and key areas. Scanning one confirms your exact location so the app can give you precise turn-by-turn directions from where you actually are, rather than relying on GPS alone (which can be difficult indoors).",
    },
    {
        q: "Why did my schedule get deleted from the tab?",
        a: "Your schedule is saved only on your device and is not backed up to a server. It can be lost if you uninstall the app, clear app data, or switch devices. We recommend re-adding your classes after any reinstall.",
    },
];

const YOUTUBE_PLAYLIST_URL = "https://youtube.com/playlist?list=PLf3IIMntMYZZdJuXB-9sZWISI1tdvd9kv&si=6Z1kQIsVb8AijLwI"

function SectionHeader({ label }) {
    return (
        <View style={s.sectionHeader}>
            <View style={s.sectionPill}>
                <Text style={s.sectionPillText}>{label}</Text>
            </View>
        </View>
    );
}

function FaqItem({ item, isOpen, onToggle }) {
    return (
        <Pressable
            style={({ pressed }) => [s.faqCard, pressed && { opacity: 0.85 }]}
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityLabel={item.q}
        >
            <View style={s.faqRow}>
                <Text style={s.faqQ}>{item.q}</Text>
                <Text style={[s.faqChevron, isOpen && s.faqChevronOpen]}>›</Text>
            </View>
            {isOpen && (
                <Text style={s.faqA}>{item.a}</Text>
            )}
        </Pressable>
    );
}

export default function UserHelp({ navigation }) {
    const [openFaq, setOpenFaq] = useState(null);
    const { bottomMenuSpace } = useBottomMenuSpacing(40);

    return (
        <SafeAreaView style={s.safe} edges={["top"]}>
            <View style={s.page}>
                <ScrollView
                    style={s.scroll}
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomMenuSpace }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={s.hero}>
                        <View style={s.heroTag}>
                            <Text style={s.heroTagText}>LionNav (will change)</Text>
                        </View>
                        <Text style={s.heroTitle}>Help &{"\n"}Support</Text>
                        <Text style={s.heroSub}>
                            Everything you need to find your way around campus.
                        </Text>
                    </View>

                    <View style={s.body}>

                        <SectionHeader label="How to use" />
                        <Text style={s.introText}>
                            Click the link to a playlist of steps to find and navigate to any classroom on campus.
                        </Text>
                        <Pressable
                            style={({ pressed }) => [s.playlistCard, pressed && { opacity: 0.88 }]}
                            onPress={() => Linking.openURL(YOUTUBE_PLAYLIST_URL)}
                            accessibilityRole="link"
                            accessibilityLabel="Open tutorial playlist on YouTube"
                        >

                            <View style={s.playlistThumb}>
                                <View style={s.playBtn}>
                                    <Text style={s.playBtnIcon}>▶</Text>
                                </View>
                                <View style={s.playlistBadge}>
                                    <Text style={s.playlistBadgeText}>Playlist</Text>
                                </View>
                            </View>
                            <View style={s.playlistInfo}>
                                <Text style={s.playlistTitle}>Campus App — Tutorial Series</Text>
                                <Text style={s.playlistSub}>
                                    Step-by-step video guides covering navigation, schedules, QR codes, and more.
                                </Text>
                                <View style={s.playlistLink}>
                                    <Text style={s.playlistLinkText}>Watch on YouTube →</Text>
                                </View>
                            </View>
                        </Pressable>


                        <SectionHeader label="Frequently asked questions" />
                        <View style={s.faqList}>
                            {FAQS.map((item, i) => (
                                <FaqItem
                                    key={i}
                                    item={item}
                                    isOpen={openFaq === i}
                                    onToggle={() => setOpenFaq(openFaq === i ? null : i)}
                                />
                            ))}
                        </View>
                    </View>
                </ScrollView>

                <BottomMenu navigation={navigation} active="Help" />
            </View>
        </SafeAreaView>
    );
}


const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: PSU.blue },
    page: { flex: 1, backgroundColor: PSU.light },
    scroll: { flex: 1 },

    hero: {
        backgroundColor: PSU.blue,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 36,
    },
    heroTag: {
        alignSelf: "flex-start",
        backgroundColor: "rgba(255,255,255,0.12)",
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 5,
        marginBottom: 14,
    },
    heroTagText: {
        color: "rgba(255,255,255,0.75)",
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.8,
        textTransform: "uppercase",
    },
    heroTitle: {
        fontSize: 40,
        fontWeight: "900",
        color: PSU.white,
        lineHeight: 44,
        letterSpacing: -0.5,
    },
    heroSub: {
        marginTop: 10,
        fontSize: 14,
        color: "rgba(255,255,255,0.6)",
        lineHeight: 20,
    },

    body: {
        paddingHorizontal: 20,
        paddingTop: 28,
    },

    sectionHeader: {
        marginBottom: 14,
        marginTop: 8,
    },
    sectionPill: {
        alignSelf: "flex-start",
        backgroundColor: PSU.tagBg,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    sectionPillText: {
        fontSize: 11,
        fontWeight: "800",
        color: PSU.tagText,
        textTransform: "uppercase",
        letterSpacing: 0.7,
    },

    introText: {
        fontSize: 14,
        color: PSU.muted,
        lineHeight: 21,
        marginBottom: 16,
    },

    // Playlist card
    playlistCard: {
        backgroundColor: PSU.white,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: PSU.border,
        overflow: "hidden",
        marginBottom: 32,
    },
    playlistThumb: {
        height: 160,
        backgroundColor: PSU.blue,
        alignItems: "center",
        justifyContent: "center",
    },
    playBtn: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: "rgba(255,255,255,0.95)",
        alignItems: "center",
        justifyContent: "center",
    },
    playBtnIcon: {
        fontSize: 22,
        color: PSU.blue,
        marginLeft: 4,
    },
    playlistBadge: {
        position: "absolute",
        top: 12,
        right: 12,
        backgroundColor: "rgba(0,0,0,0.45)",
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    playlistBadgeText: {
        fontSize: 11,
        color: PSU.white,
        fontWeight: "700",
        letterSpacing: 0.4,
    },
    playlistInfo: {
        padding: 16,
    },
    playlistTitle: {
        fontSize: 15,
        fontWeight: "800",
        color: PSU.text,
        marginBottom: 6,
    },
    playlistSub: {
        fontSize: 13,
        color: PSU.muted,
        lineHeight: 19,
        marginBottom: 12,
    },
    playlistLink: {
        alignSelf: "flex-start",
        backgroundColor: PSU.tagBg,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    playlistLinkText: {
        fontSize: 13,
        fontWeight: "700",
        color: PSU.tagText,
    },

    // FAQ
    faqList: {
        marginBottom: 32,
        gap: 8,
    },
    faqCard: {
        backgroundColor: PSU.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: PSU.border,
        padding: 16,
    },
    faqRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
    },
    faqQ: {
        flex: 1,
        fontSize: 14,
        fontWeight: "700",
        color: PSU.text,
        lineHeight: 20,
    },
    faqChevron: {
        fontSize: 22,
        color: PSU.muted,
        fontWeight: "300",
        transform: [{ rotate: "0deg" }],
    },
    faqChevronOpen: {
        transform: [{ rotate: "90deg" }],
    },
    faqA: {
        marginTop: 12,
        fontSize: 13,
        color: PSU.muted,
        lineHeight: 21,
        borderTopWidth: 1,
        borderTopColor: PSU.border,
        paddingTop: 12,
    },
});
