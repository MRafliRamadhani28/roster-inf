import db from './db.js';

async function update() {
    try {
        const { rows } = await db.query('SELECT config_json FROM pattern_config WHERE id = 1');
        if (rows.length > 0) {
            let config = JSON.parse(rows[0].config_json);
            config.scheduleTypes.forEach(t => {
                if (t.code === 'A1') t.hours = '08.00-17.00 + Stand By s/d 21.00';
                if (t.code === 'A2') t.hours = '08.00-17.00 + Stand By s/d 21.00';
            });
            await db.query('UPDATE pattern_config SET config_json = $1 WHERE id = 1', [JSON.stringify(config)]);
            console.log("Updated db successfully");
        }
    } catch(err) {
        console.error(err);
    }
    process.exit();
}
update();
