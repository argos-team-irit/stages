/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, Database, Download, CheckCircle2, X, Table } from 'lucide-react';

interface UniversityInfo {
  university: string;
  formation: string;
  year: string;
  [key: string]: any;
}

export default function App() {
  const [info, setInfo] = useState<UniversityInfo | null>(null);
  const [links, setLinks] = useState<{excelURL: string, dataJSONURL: string, editURL?: string} | null>(null);
  const [excelAvailable, setExcelAvailable] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  
  const [matricule, setMatricule] = useState('');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [tuteur1, setTuteur1] = useState('');
  const [tuteur2, setTuteur2] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [bgTaskRunning, setBgTaskRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [bgSyncInfo, setBgSyncInfo] = useState<{ status: string } | null>(null);
  const [existingStudentMsg, setExistingStudentMsg] = useState('');

  const pollBgTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/grades/task/${taskId}`);
      const taskData = await res.json();
      if (taskData.status === 'SUCCESS') {
        setBgSyncInfo({ status: `✅ Interaction avec le fichier terminée en ${(taskData.durationMs / 1000).toFixed(1)}s` });
        setMessage('Note sauvegardée avec succès !');
        setBgTaskRunning(false);
      } else if (taskData.status === 'ERROR') {
        setBgSyncInfo({ status: `⚠️ Erreur d'interaction: ${taskData.message}` });
        setMessage('Action terminée avec des erreurs.');
        setBgTaskRunning(false);
      } else {
        setBgSyncInfo({ status: `⏳ Interaction avec le fichier en cours... (${Math.round((Date.now() - taskData.startTime) / 1000)}s écoulées)` });
        setTimeout(() => pollBgTask(taskId), 2000);
      }
    } catch {
      setBgSyncInfo({ status: '⚠️ Erreur de suivi de l\'interaction' });
      setBgTaskRunning(false);
    }
  };
  
  const [lastSaved, setLastSaved] = useState<{matricule: string, nom: string, prenom: string, tuteur1: string, tuteur2: string, note: string, time: Date} | null>(null);

  const [allGrades, setAllGrades] = useState<any[]>([]);
  const [showGrades, setShowGrades] = useState(false);

  const fetchGrades = async () => {
    try {
      const res = await fetch(`/api/grades/all?t=${Date.now()}`);
      const data = await res.json();
      if (data.success) {
        setAllGrades(data.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const checkMatricule = async () => {
      if (matricule.trim().length > 3) {
        try {
          const res = await fetch(`/api/grades/check/${matricule}?t=${Date.now()}`);
          const data = await res.json();
          if (data.exists && data.student) {
            setExistingStudentMsg(`Informations récupérées. L'enregistrement mettra à jour cet étudiant.`);
            setNom(data.student.Nom || '');
            setPrenom(data.student.Prénom || '');
            setTuteur1(data.student["Tuteur 1"] || '');
            setTuteur2(data.student["Tuteur 2"] || '');
            setNote(data.student.Note !== undefined ? String(data.student.Note) : '');
          } else {
            setExistingStudentMsg('');
          }
        } catch (err) {
          console.error(err);
        }
      } else {
        setExistingStudentMsg('');
      }
    };
    
    const timeoutId = setTimeout(checkMatricule, 500);
    return () => clearTimeout(timeoutId);
  }, [matricule]);

  useEffect(() => {
    Promise.all([
      fetch('/api/university-info').then(res => res.json()),
      fetch('/api/links').then(res => res.json()),
      fetch('/api/check-excel').then(res => res.json())
    ])
      .then(([data, linksData, excelStatus]) => {
        setInfo(data);
        setLinks(linksData);
        setExcelAvailable(excelStatus.available);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch data', err);
        setInfo({
          university: 'Université de Toulouse II - UT2J',
          formation: 'L3 MIASHS parcours informatique',
          year: '2025-2026',
          filiere: 'MIASHS',
          parcours: 'Informatique',
          niveau: 'Licence 3',
          responsable: 'Dpt. MATH/INFO'
        });
        setLinks({
           excelURL: 'https://scout.univ-toulouse.fr/pub/docs/group-L3+MIASHS+parcours+info/web/2025-26/notes_stage.xlsx',
           dataJSONURL: 'https://scout.univ-toulouse.fr/pub/docs/group-L3+MIASHS+parcours+info/web/2025-26/data.json',
           editURL: 'https://scout.univ-toulouse.fr/sw?type=onlyoffice&state=14&d=115304934&doc=122888819_165aa984a4b017346364450135929b83'
        });
        setExcelAvailable(false);
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setBgSyncInfo(null);
    
    const noteValue = parseFloat(note);
    if (isNaN(noteValue) || noteValue < 0 || noteValue > 20) {
      setMessage('Erreur: La note doit être comprise entre 0 et 20.');
      setSaving(false);
      return;
    }

    try {
      const response = await fetch('/api/grades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ matricule, nom, prenom, tuteur1, tuteur2, note })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage('Patienter...');
        setLastSaved({ matricule, nom, prenom, tuteur1, tuteur2, note, time: new Date() });
        setMatricule('');
        setNom('');
        setPrenom('');
        setTuteur1('');
        setTuteur2('');
        setNote('');
        if (showGrades) {
          fetchGrades();
        }
        if (data.taskId && links?.editURL) {
          setBgSyncInfo({ status: '⏳ Lancement de l\'interaction avec le fichier...' });
          setBgTaskRunning(true);
          pollBgTask(data.taskId);
        }
      } else {
        setMessage(data.error || 'Erreur lors de la sauvegarde.');
      }
    } catch (err) {
      setMessage('Erreur de connexion au serveur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-slate-50 text-slate-800 font-sans overflow-hidden">
      <nav className="bg-indigo-900 text-white px-4 md:px-8 py-4 flex justify-between items-center shadow-md z-20">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-base md:text-lg font-bold leading-tight uppercase tracking-wider">
              {loading ? <span className="animate-pulse bg-indigo-800 h-5 w-48 block rounded"></span> : info?.university || 'Université'}
            </h1>
            <p className="text-xs text-indigo-200">
              {loading ? <span className="animate-pulse bg-indigo-800 h-3 w-32 block rounded mt-1"></span> : info?.formation || 'Formation'}
            </p>
          </div>
        </div>
        <div className="text-right hidden sm:block">
          <span className="text-xs font-mono bg-indigo-800 px-3 py-1 rounded-full text-indigo-100">
            Année Universitaire {info?.year || '2025-2026'}
          </span>
        </div>
      </nav>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 p-4 md:p-8 overflow-y-auto">
        <section className="lg:col-span-7 flex flex-col gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 flex flex-col gap-6"
          >
            <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Saisie des Notes de Stage</h2>
                <p className="text-sm text-slate-500 mt-1">Enregistrez les résultats finaux des stagiaires pour synchronisation automatique.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="matricule" className="block text-xs font-bold text-slate-800 uppercase tracking-widest mb-2">Numéro d'étudiant (Matricule)</label>
                <input
                  id="matricule"
                  type="text"
                  required
                  value={matricule}
                  onChange={(e) => setMatricule(e.target.value)}
                  placeholder="Ex: 20250001" 
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-300"
                />
                {existingStudentMsg && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-indigo-600 mt-2 font-medium flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {existingStudentMsg}
                  </motion.div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="prenom" className="block text-xs font-bold text-slate-800 uppercase tracking-widest mb-2">Prénom du Stagiaire</label>
                  <input
                    id="prenom"
                    type="text"
                    required
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    placeholder="Ex: Jean" 
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-300"
                  />
                </div>
                <div>
                  <label htmlFor="nom" className="block text-xs font-bold text-slate-800 uppercase tracking-widest mb-2">Nom du Stagiaire</label>
                  <input
                    id="nom"
                    type="text"
                    required
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    placeholder="Ex: Dupont" 
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-300"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="tuteur1" className="block text-xs font-bold text-slate-800 uppercase tracking-widest mb-2">Tuteur 1 (Nom et Prénom)</label>
                  <input
                    id="tuteur1"
                    type="text"
                    required
                    value={tuteur1}
                    onChange={(e) => setTuteur1(e.target.value)}
                    placeholder="Ex: Martin Alice" 
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-300"
                  />
                </div>
                <div>
                  <label htmlFor="tuteur2" className="block text-xs font-bold text-slate-800 uppercase tracking-widest mb-2">Tuteur 2 (Nom et Prénom)</label>
                  <input
                    id="tuteur2"
                    type="text"
                    required
                    value={tuteur2}
                    onChange={(e) => setTuteur2(e.target.value)}
                    placeholder="Ex: Bernard Luc" 
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-300"
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="note" className="block text-xs font-bold text-slate-800 uppercase tracking-widest mb-2">Note Finale (/20)</label>
                <div className="relative">
                  <input
                    id="note"
                    type="text"
                    inputMode="decimal"
                    required
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="15.5" 
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-300"
                  />
                  <span className="absolute right-4 top-3 text-slate-400 font-medium">/ 20</span>
                </div>
              </div>

              {message && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className={`px-4 py-3 rounded-lg text-sm font-medium ${
                    message.includes('succès') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {message}
                </motion.div>
              )}

              {bgSyncInfo && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className={`px-4 py-3 rounded-lg text-sm font-medium bg-slate-100 text-slate-800 border border-slate-300 flex items-center gap-2`}
                >
                  {bgSyncInfo.status.includes('⏳') || bgSyncInfo.status.includes('🤖') ? <Loader2 className="animate-spin w-4 h-4 text-indigo-500" /> : null}
                  {bgSyncInfo.status}
                </motion.div>
              )}

              <button 
                type="submit" 
                disabled={saving || bgTaskRunning}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {(saving || bgTaskRunning) ? (
                  <Loader2 className="animate-spin w-5 h-5" />
                ) : null}
                <span>Valider et Enregistrer</span>
              </button>
            </form>
          </motion.div>
        </section>

        <aside className="lg:col-span-5 flex flex-col gap-6">
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl flex-1 relative overflow-hidden flex flex-col justify-between"
          >
            <div className="relative z-10 w-full">
              <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">Détails de la Formation</h3>
              <div className="space-y-4">
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-sm text-slate-400">Filière</span>
                  <span className="text-sm font-medium">{info?.filiere || 'MIASHS'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-sm text-slate-400">Parcours</span>
                  <span className="text-sm font-medium">{info?.parcours || 'Informatique'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-sm text-slate-400">Niveau</span>
                  <span className="text-sm font-medium">{info?.niveau || 'Licence 3'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-sm text-slate-400">Responsable</span>
                  <span className="text-sm font-medium">{info?.responsable || 'Dpt. MATH/INFO'}</span>
                </div>
              </div>
              
              <div className="mt-8">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">Statut Fichier Notes</h3>
                <div className="p-3 bg-slate-800 rounded-lg border border-slate-700 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${excelAvailable ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-[10px] uppercase font-bold text-slate-300">
                      {excelAvailable ? 'Serveur SCOUT distant disponible' : 'Fichier indisponible'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
          </motion.div>

          {lastSaved && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col gap-4"
            >
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Dernière Saisie</h3>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center font-bold text-indigo-600 border border-indigo-100 shrink-0">
                  {(lastSaved.prenom.charAt(0) + lastSaved.nom.charAt(0)).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{lastSaved.prenom} {lastSaved.nom}</p>
                  <p className="text-xs text-slate-500">Note: {Number(lastSaved.note).toFixed(2)}/20 • {lastSaved.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                </div>
              </div>
            </motion.div>
          )}
        </aside>
      </main>

      {showGrades && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-600" />
                Notes Saisies (Fichier Excel)
              </h2>
              <button 
                onClick={() => setShowGrades(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
              {allGrades.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500">Aucune note n'a été saisie pour le moment.</p>
                </div>
              ) : (
                <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-bold">Matricule</th>
                        <th className="px-6 py-4 font-bold">Nom</th>
                        <th className="px-6 py-4 font-bold">Prénom</th>
                        <th className="px-6 py-4 font-bold">Note (/20)</th>
                        <th className="px-6 py-4 font-bold">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allGrades.map((grade, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-mono text-xs">{grade.Matricule}</td>
                          <td className="px-6 py-4 font-medium text-slate-800">{grade.Nom}</td>
                          <td className="px-6 py-4 text-slate-600">{grade.Prénom}</td>
                          <td className="px-6 py-4 font-bold text-indigo-600">{grade.Note}</td>
                          <td className="px-6 py-4 text-xs text-slate-400">{grade['Date'] || grade['Date Edition'] || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      <footer className="bg-white border-t border-slate-200 px-4 md:px-8 py-3 flex justify-between items-center text-[10px] text-slate-400 font-medium uppercase tracking-tighter shrink-0 z-20">
        <div><span className="hidden sm:inline">Système de Gestion de Stage v1.0.4 • </span>{info?.university?.substring(0, 2).toUpperCase() || 'UT'}</div>
        <div className="flex items-center gap-1">
          {excelAvailable ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span className="hidden sm:inline">Connecté au serveur distant</span>
              <span className="inline sm:hidden">Connecté</span>
            </>
          ) : (
             <>
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="hidden sm:inline">Serveur distant indisponible</span>
              <span className="inline sm:hidden">Indisponible</span>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

