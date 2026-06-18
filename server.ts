import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import * as xlsx from "xlsx";
import multer from "multer";


const app = express();
const PORT = 3000;

export const bgTasks: Record<string, { id: string, status: 'PENDING' | 'SUCCESS' | 'ERROR', message?: string, startTime: number, endTime?: number, durationMs?: number }> = {};

app.use(express.json());
const upload = multer({ dest: 'uploads/' });

const LINKS_FILE = path.join(process.cwd(), 'links.json');

// DEBUG STARTUP
setTimeout(async () => {
  try {
     const wb = await getLocalExcel();
     const ws = wb.Sheets[wb.SheetNames[0]];
     const existingData = xlsx.utils.sheet_to_json(ws);
     fs.writeFileSync('debug_headers.txt', JSON.stringify({
        keys: existingData.length > 0 ? Object.keys(existingData[0]) : "NO DATA",
        firstRow: existingData[0] || null
     }, null, 2));
  } catch(e) {}
}, 2000);

async function getLinksConfigAsync() {
  const defaultLinks = {
    excelURL: process.env.REMOTE_EXCEL_URL || "https://scout.univ-toulouse.fr/pub/docs/group-L3+MIASHS+parcours+info/web/2025-26/notes_stage.xlsx",
    dataJSONURL: process.env.REMOTE_DATA_JSON_URL || "https://scout.univ-toulouse.fr/pub/docs/group-L3+MIASHS+parcours+info/web/2025-26/data.json",
    editURL: ""
  };
  
  let config = { ...defaultLinks };
  if (fs.existsSync(LINKS_FILE)) {
    try {
      const data = fs.readFileSync(LINKS_FILE, 'utf-8');
      config = { ...config, ...JSON.parse(data) };
    } catch (e) {
      console.error("Error reading links.json", e);
    }
  }

  // Try to update from remote data.json
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 5000);
    const response = await fetch(config.dataJSONURL, { signal: ac.signal });
    clearTimeout(to);
    if (response.ok) {
      const text = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        // Handle malformed JSON if necessary
        console.log("Malformed JSON retrieved, attempting fallback extraction.");
        const match = text.match(/"lien[^"]*"\s*:\s*"([^"]+)"/i) || text.match(/"lien:([^"]+)"/i) || text.match(/"lien"?[:\s]*"?([^"\n}]+)"?/i);
        if (match && match[1]) {
           data.lien = match[1];
        } else {
           console.log("Could not extract lien from:", text);
        }
      }
      
      if (data.lien) config.editURL = data.lien;
      fs.writeFileSync(LINKS_FILE, JSON.stringify(config, null, 2));
    }
  } catch (err) {
    console.log("Failed to fetch remote data.json for links config:", err);
  }

  return config;
}

const LOCAL_EXCEL_FILE = path.join(process.cwd(), 'local_notes_stage.xlsx');

async function getLocalExcel() {
  const config = await getLinksConfigAsync();
  
  // Always fetch latest from remote if URL is set
  if (config.excelURL) {
    try {
      const response = await fetch(config.excelURL);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(LOCAL_EXCEL_FILE, buffer);
        return xlsx.read(buffer);
      }
    } catch (err) {
      console.log("Remote excel fetch failed, falling back to local");
    }
  }

  // Fallback to local if remote fails or no URL
  if (fs.existsSync(LOCAL_EXCEL_FILE)) {
    const buf = fs.readFileSync(LOCAL_EXCEL_FILE);
    return xlsx.read(buf);
  }

  // Create new workbook if all fails
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet([]);
  xlsx.utils.book_append_sheet(wb, ws, "Notes");
  const out = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  fs.writeFileSync(LOCAL_EXCEL_FILE, out);
  return wb;
}

app.get("/api/links", async (req, res) => {
  res.json(await getLinksConfigAsync());
});

app.get("/api/check-excel", async (req, res) => {
  try {
    const config = await getLinksConfigAsync();
    const response = await fetch(config.excelURL, { method: 'HEAD' });
    res.json({ available: response.ok });
  } catch (e) {
    res.json({ available: false });
  }
});

app.get("/api/university-info", async (req, res) => {
  const fallbackData = {
    university: "Université de Toulouse II - UT2J",
    formation: "L3 MIASHS parcours informatique",
    year: "2025-2026",
    filiere: "MIASHS",
    parcours: "Informatique",
    niveau: "Licence 3",
    responsable: "Dpt. MATH/INFO"
  };

  try {
    const config = await getLinksConfigAsync();
    const response = await fetch(config.dataJSONURL);
    if (!response.ok) {
      throw new Error("Failed to fetch university info");
    }
    const text = await response.text();
    if (!text || text.trim() === '') {
      throw new Error("Empty response");
    }
    const data = JSON.parse(text);
    res.json({ ...fallbackData, ...data });
  } catch (error) {
    // Fallback data if URL is unreachable or JSON is invalid
    res.json(fallbackData);
  }
});

  app.post("/api/grades", async (req, res) => {
    try {
      const { matricule, nom, prenom, tuteur1, tuteur2, note } = req.body;
      
      if (!matricule || !nom || !prenom || !tuteur1 || !tuteur2 || note === undefined) {
        return res.status(400).json({ error: "Tous les champs (matricule, nom, prénom, tuteurs, note) sont obligatoires." });
      }

      const noteNum = Number(note);
      if (isNaN(noteNum) || noteNum < 0 || noteNum > 20) {
        return res.status(400).json({ error: "La note doit être comprise entre 0 et 20." });
      }
  
      const wb = await getLocalExcel();
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      
      // Parse existing data
      let existingData = xlsx.utils.sheet_to_json(ws);
      // Clean up empty rows that might be read due to formatting
      existingData = existingData.filter((row: any) => row && Object.keys(row).length > 0 && row.Matricule);
      
      const existingRowIndex = existingData.findIndex((row: any) => String(row.Matricule) === String(matricule));
      const editTime = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

      if (existingRowIndex >= 0) {
        // Update existing row
        existingData[existingRowIndex] = {
          ...(existingData[existingRowIndex] as any),
          Nom: nom,
          Prénom: prenom,
          "Tuteur 1": tuteur1,
          "Tuteur 2": tuteur2 || "",
          Note: Number(note),
          "Date": editTime
        };
      } else {
        // Add new row
        existingData.push({
          Matricule: matricule,
          Nom: nom,
          Prénom: prenom,
          "Tuteur 1": tuteur1,
          "Tuteur 2": tuteur2 || "",
          Note: Number(note),
          "Date": editTime
        });
      }
    
    // Convert back to sheet
    const newWs = xlsx.utils.json_to_sheet(existingData);
    wb.Sheets[wsName] = newWs;
    
    // Save locally
    const out = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    fs.writeFileSync(LOCAL_EXCEL_FILE, out);

    // Try to update remote Excel
    let remoteMsg = "";
    try {
      const config = await getLinksConfigAsync();
      const putResponse = await fetch(config.excelURL, {
        method: 'PUT',
        body: out,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
      if (!putResponse.ok) {
        remoteMsg = ` (Non synchronisé: Status ${putResponse.status})`;
      } else {
        remoteMsg = ` (Synchronisé en ligne)`;
      }
    } catch(e) {
      remoteMsg = ` (Erreur réseau vers le serveur distant)`;
    }
    
    const baseMessage = existingRowIndex >= 0 ? "Note mise à jour avec succès" : "Note sauvegardée avec succès";
    
    // Trigger sheetdb background sync without awaiting it
    const taskId = Date.now().toString();
    bgTasks[taskId] = { id: taskId, status: 'PENDING', startTime: Date.now() };
    const targetIndex = existingRowIndex >= 0 ? existingRowIndex : existingData.length - 1;
    const pressDownCount = targetIndex + 1;
    runSheetDbBackground(taskId, matricule, editTime, nom, prenom, tuteur1, tuteur2, note, existingRowIndex >= 0).catch(console.error);

    res.json({ success: true, message: baseMessage + remoteMsg, taskId });
  } catch (error) {
    console.error("Error saving grade:", error);
    res.status(500).json({ error: "Erreur lors de la sauvegarde de la note." });
  }
});

app.get("/api/grades/all", async (req, res) => {
  try {
    const wb = await getLocalExcel();
    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    const existingData = xlsx.utils.sheet_to_json(ws);
    try {
       fs.writeFileSync('debug_headers.txt', JSON.stringify(existingData.length > 0 ? Object.keys(existingData[0]) : "NO DATA"));
    } catch(e) {}
    console.log("EXCEL HEADERS:", existingData.length > 0 ? Object.keys(existingData[0]) : "NO DATA");
    res.json({ success: true, data: existingData });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la récupération des notes." });
  }
});

app.get("/api/grades/check/:matricule", async (req, res) => {
  try {
    const matricule = req.params.matricule;
    let student = null;

    // 1. First, check SheetDB if configured
    const links = await getLinksConfigAsync();
    if (links.editURL && links.editURL.includes("sheetdb.io")) {
      try {
        const fetchRes = await fetch(`${links.editURL}/search?Matricule=${encodeURIComponent(matricule)}`);
        const fetchJson = await fetchRes.json();
        if (Array.isArray(fetchJson) && fetchJson.length > 0) {
          student = fetchJson[0];
        }
      } catch (err) {
        console.error("SheetDB read error:", err);
      }
    }

    // 2. Fallback to local DB if no student found remotely
    if (!student) {
      const wb = await getLocalExcel();
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      const existingData = xlsx.utils.sheet_to_json(ws);
      student = existingData.find((row: any) => String(row.Matricule) === String(matricule));
    }
    
    if (student) {
      res.json({ exists: true, student });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la vérification de l'étudiant." });
  }
});

app.post("/api/grades/upload", upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier fourni." });
    
    // Read the uploaded file
    const buf = fs.readFileSync(req.file.path);
    const uploadedWb = xlsx.read(buf);
    
    // Save it as the new local file
    const out = xlsx.write(uploadedWb, { type: "buffer", bookType: "xlsx" });
    fs.writeFileSync(LOCAL_EXCEL_FILE, out);
    
    // Clean up
    fs.unlinkSync(req.file.path);
    
    res.json({ success: true, message: "Fichier remplacé avec succès." });
  } catch(error) {
    res.status(500).json({ error: "Erreur lors de l'importation." });
  }
});

app.get("/api/grades/task/:id", (req, res) => {
  const task = bgTasks[req.params.id];
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

async function runSheetDbBackground(taskId: string, matricule: string, editTime: string, nom: string, prenom: string, tuteur1: string, tuteur2: string, note: string, isUpdate: boolean) {
  const links = await getLinksConfigAsync();
  if (!links.editURL || !links.editURL.includes("sheetdb.io")) {
    if (bgTasks[taskId]) {
      bgTasks[taskId].status = 'ERROR';
      bgTasks[taskId].message = "L'URL d'édition n'est pas ou mal configurée (SheetDB manquant).";
    }
    return;
  }

  try {
    console.log("Lancement de la synchronisation SheetDB en arrière-plan...");
    
    const rowData = {
      "Matricule": matricule,
      "Nom": nom,
      "Prénom": prenom,
      "Tuteur 1": tuteur1,
      "Tuteur 2": tuteur2 || "-",
      "Note": note,
      "Date": editTime
    };

    let fetchObj: any = {};
    let targetUrl = links.editURL;

    // Safety check: Always query SheetDB first to ensure we don't duplicate rows
    let finalUpdate = isUpdate;
    try {
      const searchRes = await fetch(`${links.editURL}/search?Matricule=${encodeURIComponent(matricule)}`);
      if (searchRes.ok) {
        const searchJson = await searchRes.json();
        if (Array.isArray(searchJson) && searchJson.length > 0) {
          finalUpdate = true;
        } else {
          finalUpdate = false;
        }
      }
    } catch(e) {
      console.error("Erreur lors de la vérification préalable de SheetDB:", e);
    }

    if (finalUpdate) {
      // Setup update request
      targetUrl = `${links.editURL}/Matricule/${encodeURIComponent(matricule)}`;
      fetchObj = {
        method: 'PATCH',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: rowData })
      };
    } else {
      // Setup create request
      fetchObj = {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: rowData })
      };
    }

    const res = await fetch(targetUrl, fetchObj);
    const jsonRes = await res.json();
    console.log("Réponse SheetDB:", jsonRes);

    if (res.ok) {
      if (bgTasks[taskId]) {
        bgTasks[taskId].status = 'SUCCESS';
        bgTasks[taskId].message = "Fichier mis à jour !";
        bgTasks[taskId].endTime = Date.now();
        bgTasks[taskId].durationMs = bgTasks[taskId].endTime! - bgTasks[taskId].startTime;
      }
    } else {
      throw new Error(jsonRes.error || "Une erreur est survenue avec SheetDB.");
    }
  } catch (error: any) {
    console.error("Erreur SheetDB en arrière-plan:", error);
    if (bgTasks[taskId]) {
      bgTasks[taskId].status = 'ERROR';
      bgTasks[taskId].message = error.message;
      bgTasks[taskId].endTime = Date.now();
    }
  }
}


app.get("/api/grades/download", async (req, res) => {
  try {
    if (!fs.existsSync(LOCAL_EXCEL_FILE)) {
      await getLocalExcel();
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.download(LOCAL_EXCEL_FILE, "notes_stage.xlsx");
  } catch (error) {
    res.status(500).send("File not found");
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
