import fetch from "node-fetch";

(async () => {
    const editURL = 'https://sheetdb.io/api/v1/uag15i00rnhxi';
    try {
        const res = await fetch(editURL + '?limit=1');
        console.log(await res.json());
    } catch(e) {
        console.error(e);
    }
})();
