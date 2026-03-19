import React, { useState } from 'react';
import {
    View, Text, Image, TouchableOpacity,
    ScrollView, StyleSheet, Dimensions
} from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');
const MAP_W = width - 36;
const MAP_H = MAP_W * (1194.6667 / 1481.3333);

const BUILDINGS = [
    { id: 'sutherland',  name: 'Sutherland Hall' },
    { id: 'woodland',    name: 'Woodland Building' },
    { id: 'lares',       name: 'Lares Hall' },
    { id: 'rydal',       name: 'Rydal Executive Center' },
    { id: 'springhouse', name: 'Springhouse' },
    { id: 'athletic',    name: 'Athletic Fields' },
];

const PATHS = {
    sutherland:  "m 1074.9062,466.5519 71.6359,-91.1062 45.5531,32.69537 5.5105,-8.082 27.9196,27.55228 9.5515,37.47109 -27.9197,24.61337 -36.369,-42.61419 -14.3272,17.2661 9.9188,26.08282 -6.2451,6.97991 -23.5113,-2.57155 -4.4084,5.51046 19.4703,14.32718 -1.8368,26.45019 -12.123,10.28618 -5.8778,-3.67363 -9.9189,13.22509 6.9799,9.55145 -43.7162,40.04265 -27.1849,-23.87864 19.4702,-55.10456 19.8377,-15.42927 -23.1439,-19.10292 z",
    woodland:    "m 628.92665,380.22143 10.28619,11.02091 14.69454,-15.06191 4.041,3.30627 21.3071,-15.79664 70.90119,-84.86101 0.36737,-12.123 43.71628,-65.39074 -8.81673,-14.69455 2.93891,-6.61255 19.10291,-0.36736 12.123,-15.06191 -0.73472,-8.44937 6.24518,-1.46945 V 91.840925 h -4.77573 l -0.73473,-9.551456 h -45.18573 l -0.73473,10.286183 -22.04182,7.347274 0.36736,8.816724 h -2.93891 l -4.041,-2.9389 -34.89955,47.02255 4.40836,2.57154 -0.73472,5.1431 -2.20418,0.36736 v 5.87782 l -2.57155,2.57155 v 3.30627 l -3.67364,2.20418 -0.36736,3.67364 10.28618,6.24518 -21.30709,37.83846 -20.57237,2.20418 v 8.08201 l 15.79664,40.77737 -4.77573,6.24518 2.20418,2.20418 -12.123,12.123 -4.40836,-2.20418 -9.91882,8.44937 0.36736,8.81672 -5.14309,3.30628 -0.36736,11.38827 -4.04101,4.40837 1.46946,1.83682 -15.06191,13.59245 -0.36737,10.65355 -5.14309,-0.36736 0.73473,4.77572 -8.082,10.65355 5.51045,5.14309 z",
    lares:       "m 1014.6435,151.18344 -10.9101,13.5078 -15.58596,43.90035 3.37695,20.26169 17.40431,14.2871 2.5976,-3.11718 9.0918,7.53319 -0.2598,3.37695 8.0528,4.67578 1.8183,-1.5586 8.5723,5.71484 17.4043,7.5332 3.8964,-3.63672 40.0039,27.0156 9.0918,-10.13085 4.416,1.03906 4.6758,-4.41601 -3.1172,-4.67577 7.793,-8.05273 5.7148,3.37695 3.377,-1.29883 v -11.16991 l 3.6367,-2.85742 0.2597,-14.54686 3.8965,-0.25976 -0.2598,-2.85742 -3.6367,-1.29883 0.5196,-2.33789 2.8574,0.51953 v -8.83202 l -16.1055,-1.81836 -6.4941,-6.49413 -6.2344,1.29883 -52.4726,-41.3027 -6.4941,-0.25976 -28.834,-22.85935 z",
    rydal:       "m 440.83644,474.26654 12.123,12.123 8.44937,-9.18409 7.34727,6.97991 28.65437,-29.02174 20.205,13.95982 18.00082,-15.42927 -14.32718,-16.53137 -5.87782,-21.30709 -22.04182,6.61254 -6.97991,-2.20418 -4.77573,4.40837 -5.51046,-2.57155 -3.67363,8.81673 -22.04182,11.75564 -1.46946,12.123 -5.14309,2.20418 2.20418,4.40837 z",
    springhouse: "m 881.67288,69.431739 24.61337,-4.408364 30.49118,8.449365 3.67364,-3.673637 4.77573,1.836818 1.46945,-3.673637 -4.041,-2.571546 2.20418,-9.918819 -31.22591,-9.91882 -1.83682,-4.775728 -5.87782,-0.367364 -4.40836,5.877819 -20.57237,0.734727 z",
    athletic:    "m 557.6581,686.97012 77.8811,32.69537 1.10209,19.83764 3.67364,-0.73473 1.10209,5.87782 -71.26856,145.10866 -27.91964,-13.22509 3.30627,-9.1841 -38.57319,-15.79664 -19.10291,-9.18409 0.73473,-24.98073 z",
};

export default function MapView() {
    const navigation = useNavigation();
    const [selected, setSelected] = useState('');

    return (
        <ScrollView
            style={styles.page}
            contentContainerStyle={{ paddingBottom: 100 }}
        >
            {/* Brand row */}
            <View style={styles.brandRow}>
                <View style={styles.psuBadge}>
                    <Text style={styles.psuBadgeText}>PSU</Text>
                </View>
                <Text style={styles.brand}>PENN STATE ABINGTON</Text>
            </View>

            {/* Title */}
            <Text style={styles.title}>Campus{'\n'}Map</Text>

            {/* Panel */}
            <View style={styles.panel}>
                <Text style={styles.panelTitle}>Select a Building</Text>

                {/* Horizontal pill selector */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 14 }}
                >
                    {BUILDINGS.map((b) => (
                        <TouchableOpacity
                            key={b.id}
                            style={[styles.pill, selected === b.id && styles.pillActive]}
                            onPress={() => setSelected(b.id)}
                        >
                            <Text style={[styles.pillText, selected === b.id && styles.pillTextActive]}>
                                {b.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Map with SVG overlay */}
                <View style={[styles.mapContainer, { height: MAP_H }]}>
                    <Image
                        source={require('./assets/psu-abington-map.jpeg')}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                    />
                    <Svg
                        style={StyleSheet.absoluteFill}
                        viewBox="0 0 1481.3333 1194.6667"
                        width={MAP_W}
                        height={MAP_H}
                    >
                        {BUILDINGS.map((b) => (
                            <Path
                                key={b.id}
                                d={PATHS[b.id]}
                                fill={selected === b.id
                                    ? 'rgba(30,64,124,0.4)'
                                    : 'rgba(30,64,124,0.1)'}
                                stroke="#1E407C"
                                strokeWidth={selected === b.id ? 3 : 1.5}
                                onPress={() => setSelected(b.id)}
                            />
                        ))}
                    </Svg>
                </View>

                {/* Selected building info */}
                {selected !== '' && (
                    <View style={styles.selectedBox}>
                        <Text style={styles.selectedName}>
                            {BUILDINGS.find(b => b.id === selected)?.name}
                        </Text>
                        <TouchableOpacity
                            style={styles.btn}
                            onPress={() => navigation.navigate('BuildingMap', { buildingId: selected })}
                        >
                            <Text style={styles.btnText}>View Floor Map →</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    page: {
        flex: 1,
        backgroundColor: '#F5F7FB',
        paddingHorizontal: 18,
        paddingTop: 28,
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    psuBadge: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: '#001E44',
        alignItems: 'center',
        justifyContent: 'center',
    },
    psuBadgeText: {
        color: 'white',
        fontWeight: '900',
        fontSize: 12,
    },
    brand: {
        fontWeight: '900',
        letterSpacing: 2,
        fontSize: 11,
        color: '#1E407C',
    },
    title: {
        marginTop: 10,
        fontSize: 36,
        fontWeight: '900',
        color: '#001E44',
        lineHeight: 40,
    },
    panel: {
        marginTop: 18,
        backgroundColor: 'white',
        borderRadius: 18,
        padding: 16,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 3,
    },
    panelTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#001E44',
        marginBottom: 10,
    },
    pill: {
        marginRight: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#E6ECF5',
        backgroundColor: 'white',
    },
    pillActive: {
        backgroundColor: '#1E407C',
        borderColor: '#1E407C',
    },
    pillText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#1E407C',
    },
    pillTextActive: {
        color: 'white',
    },
    mapContainer: {
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E6ECF5',
    },
    selectedBox: {
        marginTop: 14,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E6ECF5',
        backgroundColor: 'rgba(30,64,124,0.05)',
    },
    selectedName: {
        fontSize: 18,
        fontWeight: '900',
        color: '#001E44',
    },
    btn: {
        marginTop: 10,
        height: 46,
        borderRadius: 12,
        backgroundColor: '#1E407C',
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnText: {
        color: 'white',
        fontWeight: '900',
        fontSize: 15,
    },
});