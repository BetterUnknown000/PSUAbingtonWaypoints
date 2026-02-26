const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const dataPath = path.join(__dirname, 'campusData.json');

if (!fs.existsSync(dataPath)) {
    console.error('ERROR: campusData.json not found. Make sure it is in the same folder.');
    process.exit(1);
}

const { buildings, rooms } = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

function cleanName(name) {
    return name.replace(/ Hall| Building/gi, '').trim();
}

function findRoom(buildingId, roomNumber) {
    return rooms.find(
        r => r.building === buildingId && r.room_number.toLowerCase() === roomNumber.toLowerCase()
    );
}

function printRoom(room, building) {
    console.log(`
  +------------------------------------------+
  |  Room:      ${room.room_number} -- ${room.room_name}
  |  Building:  ${cleanName(building.name)}
  |  Floor:     ${room.floor}
  |  Type:      ${room.type}
  |  Latitude:  ${building.latitude}
  |  Longitude: ${building.longitude}
  +------------------------------------------+`);
}

function showMenu() {
    console.log('\n  Penn State Abington -- Room Finder');
    console.log('  ------------------------------------\n');
    console.log('  Select a building:\n');
    buildings.forEach((b, i) => {
        console.log(`     ${i + 1}. ${cleanName(b.name)}`);
    });
    console.log(`\n     0. Exit\n`);
}

async function main() {
    while (true) {
        showMenu();

        const choice = (await ask('  Enter number: ')).trim();
        const num = parseInt(choice);

        if (num === 0) {
            console.log('\n  Goodbye.\n');
            rl.close();
            break;
        }

        if (isNaN(num) || num < 1 || num > buildings.length) {
            console.log('\n  Invalid choice.\n');
            continue;
        }

        const building = buildings[num - 1];

        const roomInput = (await ask(`\n  Building: ${cleanName(building.name)}  |  Room number: `)).trim();

        if (!roomInput) continue;

        const room = findRoom(building.id, roomInput);

        if (room) {
            printRoom(room, building);
        } else {
            console.log(`\n  Room ${roomInput} not found in ${cleanName(building.name)}.`);
        }

        console.log('');
    }
}

main();