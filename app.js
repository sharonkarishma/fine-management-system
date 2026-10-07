/**
 * Fine Management System - IIM Visakhapatnam
 * Core Client-Side Logic and Database Simulation
 */

// ==========================================
// 1. STATE & SIMULATED DATABASE MANAGER
// ==========================================

// Safe Storage Shadowing Polyfill for local file execution
let localStorage;
let sessionStorage;
try {
    const testKey = '__storage_test_key__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    localStorage = window.localStorage;
    sessionStorage = window.sessionStorage;
} catch (e) {
    console.warn('HTML5 storage is disabled or restricted in this browser environment. Using in-memory fallback.');
    const memoryLocalStorage = {};
    localStorage = {
        getItem: (key) => memoryLocalStorage[key] || null,
        setItem: (key, val) => { memoryLocalStorage[key] = val.toString(); },
        removeItem: (key) => { delete memoryLocalStorage[key]; }
    };
    const memorySessionStorage = {};
    sessionStorage = {
        getItem: (key) => memorySessionStorage[key] || null,
        setItem: (key, val) => { memorySessionStorage[key] = val.toString(); },
        removeItem: (key) => { delete memorySessionStorage[key]; }
    };
}

// Helper to safely register event listeners even if DOM is not ready
function safeAddListener(id, event, callback) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener(event, callback);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            const elLazy = document.getElementById(id);
            if (elLazy) elLazy.addEventListener(event, callback);
        });
    }
}

const DB_KEYS = {
    STUDENTS: 'fms_students',
    FINES: 'fms_fines',
    VIOLATIONS: 'fms_violations',
    AUDIT_TRAIL: 'fms_audit_trail',
    ADMIN_LOGIN_LOG: 'fms_admin_login_log',
    ADMIN_ACTION_LOG: 'fms_admin_action_log',
    EVENTS: 'fms_events',
    EVENT_ATTENDANCE: 'fms_event_attendance',
    EVENT_VIOLATION_CATEGORIES: 'fms_event_violation_categories',
    COHORT_SETTINGS: 'fms_cohort_settings'
};

// Global Memory State (mirrors LocalStorage)
let db = {
    students: [],
    fines: [],
    violations: [],
    auditTrail: [],
    loginLog: [],
    actionLog: [],
    events: [],
    eventAttendance: [],
    eventViolationCategories: [],
    cohortSettings: {
        summerYear: '2026-27',
        summerPrefix: '26',
        finalYear: '2025-27',
        finalPrefix: '25'
    }
};

// Default Admin User Credentials
const DEFAULT_ADMIN = {
    username: 'admin',
    password: 'admin123',
    name: 'Placement Admin'
};

function safeJSONParse(str, fallback = []) {
    if (!str) return fallback;
    try {
        const parsed = JSON.parse(str);
        return parsed || fallback;
    } catch (e) {
        console.warn('Failed to parse JSON, using fallback:', e);
        return fallback;
    }
}

// Global Supabase Client
let supabaseClient = null;
const SUPABASE_KEYS = {
    URL: 'fms_supabase_url',
    KEY: 'fms_supabase_key'
};

function initSupabase() {
    const url = localStorage.getItem(SUPABASE_KEYS.URL);
    const key = localStorage.getItem(SUPABASE_KEYS.KEY);
    
    if (url && key && window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(url, key);
            document.getElementById('dbSyncIndicator').style.display = 'inline-flex';
            document.getElementById('dbLocalStatus').style.display = 'none';
            return true;
        } catch (e) {
            console.error('Failed to initialize Supabase client:', e);
        }
    }
    supabaseClient = null;
    document.getElementById('dbSyncIndicator').style.display = 'none';
    document.getElementById('dbLocalStatus').style.display = 'inline-flex';
    return false;
}

function updateSyncStatusText(text) {
    const el = document.getElementById('dbSyncStatusText');
    if (el) el.innerText = `Supabase: ${text}`;
}

async function pushToCloud(table, item) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from(table).upsert(item);
        if (error) console.error(`Failed to push to Supabase table ${table}:`, error);
    } catch (e) {
        console.error(`Supabase network push error:`, e);
    }
}

async function syncWithSupabase() {
    if (!supabaseClient) return;
    
    updateSyncStatusText('Syncing...');
    
    const isForcePush = localStorage.getItem('fms_force_push_next') === 'true';
    
    try {
        if (isForcePush) {
            updateSyncStatusText('Overwriting Cloud...');
            // 1. Clear all cloud tables using client-level delete
            await supabaseClient.from('event_attendance').delete().neq('id', '');
            await supabaseClient.from('event_violation_categories').delete().neq('id', '');
            await supabaseClient.from('fines').delete().neq('id', '');
            await supabaseClient.from('events').delete().neq('id', '');
            await supabaseClient.from('students').delete().neq('id', '');
            await supabaseClient.from('violations').delete().neq('id', '');
            await supabaseClient.from('action_log').delete().neq('id', '');
            await supabaseClient.from('audit_trail').delete().neq('id', '');

            // 2. Upload all local data arrays to clean Supabase tables
            if (db.violations.length > 0) {
                const sanitizedViolations = db.violations.map(v => ({
                    id: v.id,
                    category_name: v.category_name,
                    parent_category: v.parent_category,
                    cohort: v.cohort,
                    monetary_penalty_amount: v.monetary_penalty_amount,
                    red_flag_count: v.red_flag_count
                }));
                await supabaseClient.from('violations').insert(sanitizedViolations);
            }
            if (db.students.length > 0) {
                await supabaseClient.from('students').insert(db.students);
            }
            if (db.events.length > 0) {
                await supabaseClient.from('events').insert(db.events);
            }
            if (db.fines.length > 0) {
                await supabaseClient.from('fines').insert(db.fines);
            }
            if (db.eventAttendance.length > 0) {
                await supabaseClient.from('event_attendance').insert(db.eventAttendance);
            }
            if (db.eventViolationCategories.length > 0) {
                await supabaseClient.from('event_violation_categories').insert(db.eventViolationCategories);
            }
            if (db.actionLog.length > 0) {
                await supabaseClient.from('action_log').insert(db.actionLog);
            }
            if (db.auditTrail.length > 0) {
                await supabaseClient.from('audit_trail').insert(db.auditTrail);
            }

            localStorage.removeItem('fms_force_push_next');
            showToast('Cloud database overwritten with local browser data successfully!', 'success');
            updateSyncStatusText('Synced');
            return;
        }

        // A. PUSH local changes up to Supabase first (to prevent cloud overwriting local data)
        if (db.students.length > 0) {
            await supabaseClient.from('students').upsert(db.students);
        }
        if (db.fines.length > 0) {
            await supabaseClient.from('fines').upsert(db.fines);
        }
        if (db.events.length > 0) {
            await supabaseClient.from('events').upsert(db.events);
        }
        if (db.eventAttendance.length > 0) {
            await supabaseClient.from('event_attendance').upsert(db.eventAttendance);
        }
        if (db.eventViolationCategories.length > 0) {
            await supabaseClient.from('event_violation_categories').upsert(db.eventViolationCategories);
        }
        if (db.actionLog.length > 0) {
            await supabaseClient.from('action_log').upsert(db.actionLog);
        }
        if (db.auditTrail.length > 0) {
            await supabaseClient.from('audit_trail').upsert(db.auditTrail);
        }

        // B. PULL latest data from Supabase to stay updated
        // 1. Fetch violations
        const { data: violationsData, error: vErr } = await supabaseClient.from('violations').select('*');
        if (vErr || !violationsData) {
            throw new Error(`Violations fetch error: ${vErr ? vErr.message : 'No data returned'}`);
        }
        
        // Seed Supabase if empty
        if (violationsData.length === 0) {
            if (db.violations.length === 0) seedViolationCategories();
            const sanitized = db.violations.map(v => ({
                id: v.id,
                category_name: v.category_name,
                parent_category: v.parent_category,
                cohort: v.cohort,
                monetary_penalty_amount: v.monetary_penalty_amount,
                red_flag_count: v.red_flag_count
            }));
            const { error: insErr } = await supabaseClient.from('violations').insert(sanitized);
            if (insErr) {
                throw new Error(`Failed to seed violations table: ${insErr.message}`);
            }
        } else {
            const localRefs = [...db.violations];
            if (localRefs.length === 0) {
                seedViolationCategories();
            }
            
            db.violations = violationsData.map(v => {
                const local = localRefs.find(lv => lv.id === v.id);
                return {
                    ...v,
                    combination_type: local ? local.combination_type : 'MONETARY_ONLY',
                    description: local ? local.description : ''
                };
            });
            saveTable(DB_KEYS.VIOLATIONS, db.violations);
        }
        
        // 2. Fetch students
        const { data: studentsData, error: sErr } = await supabaseClient.from('students').select('*');
        if (sErr || !studentsData) {
            throw new Error(`Students fetch error: ${sErr ? sErr.message : 'No data returned'}`);
        }
        db.students = studentsData;
        saveTable(DB_KEYS.STUDENTS, db.students);
        
        // 3. Fetch fines
        const { data: finesData, error: fErr } = await supabaseClient.from('fines').select('*');
        if (fErr || !finesData) {
            throw new Error(`Fines fetch error: ${fErr ? fErr.message : 'No data returned'}`);
        }
        db.fines = finesData;
        saveTable(DB_KEYS.FINES, db.fines);
        
        // 4. Fetch audit trail
        const { data: auditData, error: aErr } = await supabaseClient.from('audit_trail').select('*');
        if (aErr || !auditData) {
            throw new Error(`Audit trail fetch error: ${aErr ? aErr.message : 'No data returned'}`);
        }
        db.auditTrail = auditData;
        saveTable(DB_KEYS.AUDIT_TRAIL, db.auditTrail);
        
        // 5. Fetch action logs
        const { data: logsData, error: lErr } = await supabaseClient.from('action_log').select('*');
        if (lErr || !logsData) {
            throw new Error(`Action log fetch error: ${lErr ? lErr.message : 'No data returned'}`);
        }
        db.actionLog = logsData;
        saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
        
        // 6. Fetch events
        const { data: eventsData, error: eErr } = await supabaseClient.from('events').select('*');
        if (eErr || !eventsData) {
            throw new Error(`Events fetch error: ${eErr ? eErr.message : 'No data returned'}`);
        }
        db.events = eventsData;
        saveTable(DB_KEYS.EVENTS, db.events);
        
        // 7. Fetch event attendance
        const { data: attendanceData, error: eaErr } = await supabaseClient.from('event_attendance').select('*');
        if (eaErr || !attendanceData) {
            throw new Error(`Event attendance fetch error: ${eaErr ? eaErr.message : 'No data returned'}`);
        }
        db.eventAttendance = attendanceData;
        saveTable(DB_KEYS.EVENT_ATTENDANCE, db.eventAttendance);
        
        updateSyncStatusText('Connected');
        
        // Re-render layout
        loadStudentList();
        loadFineList();
        if (currentView === 'events') loadEventsList();
        if (currentView === 'manage-event') loadEventDetailView();
        if (currentView === 'red-flags') loadRedFlagsRegistry();
        if (currentView === 'audit') loadAuditLogs();
        initializeDashboard();
        
    } catch (e) {
        console.error('Supabase sync error:', e);
        updateSyncStatusText('Sync Failed');
        showToast(`Supabase Sync Failed: ${e.message}`, 'warning');
    }
}

function subscribeRealtime() {
    if (!supabaseClient) return;
    
    // Listen to students
    supabaseClient.channel('realtime_students')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, payload => {
            handleRealtimeChange('students', payload);
        })
        .subscribe();

    // Listen to fines
    supabaseClient.channel('realtime_fines')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fines' }, payload => {
            handleRealtimeChange('fines', payload);
        })
        .subscribe();

    // Listen to audit trail
    supabaseClient.channel('realtime_audit')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_trail' }, payload => {
            handleRealtimeChange('audit_trail', payload);
        })
        .subscribe();

    // Listen to action logs
    supabaseClient.channel('realtime_logs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'action_log' }, payload => {
            handleRealtimeChange('action_log', payload);
        })
        .subscribe();

    // Listen to events
    supabaseClient.channel('realtime_events')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, payload => {
            handleRealtimeChange('events', payload);
        })
        .subscribe();

    // Listen to event attendance
    supabaseClient.channel('realtime_attendance')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_attendance' }, payload => {
            handleRealtimeChange('event_attendance', payload);
        })
        .subscribe();
}

function handleRealtimeChange(table, payload) {
    console.log(`Realtime update received on ${table}:`, payload);
    
    let targetArray = [];
    let key = '';
    
    if (table === 'students') {
        targetArray = db.students;
        key = DB_KEYS.STUDENTS;
    } else if (table === 'fines') {
        targetArray = db.fines;
        key = DB_KEYS.FINES;
    } else if (table === 'audit_trail') {
        targetArray = db.auditTrail;
        key = DB_KEYS.AUDIT_TRAIL;
    } else if (table === 'action_log') {
        targetArray = db.actionLog;
        key = DB_KEYS.ADMIN_ACTION_LOG;
    } else if (table === 'events') {
        targetArray = db.events;
        key = DB_KEYS.EVENTS;
    } else if (table === 'event_attendance') {
        targetArray = db.eventAttendance;
        key = DB_KEYS.EVENT_ATTENDANCE;
    }
    
    const event = payload.eventType;
    
    if (event === 'INSERT') {
        const exists = targetArray.some(x => x.id === payload.new.id);
        if (!exists) {
            targetArray.unshift(payload.new);
        }
    } else if (event === 'UPDATE') {
        const idx = targetArray.findIndex(x => x.id === payload.new.id);
        if (idx !== -1) {
            targetArray[idx] = payload.new;
        } else {
            targetArray.unshift(payload.new);
        }
    } else if (event === 'DELETE') {
        const idx = targetArray.findIndex(x => x.id === payload.old.id);
        if (idx !== -1) {
            targetArray.splice(idx, 1);
        }
    }
    
    saveTable(key, targetArray);
    
    if (table === 'students') loadStudentList();
    else if (table === 'fines') loadFineList();
    else if (table === 'audit_trail' && currentView === 'audit') loadAuditLogs();
    else if (table === 'events') {
        if (currentView === 'events') loadEventsList();
        if (currentView === 'manage-event') loadEventDetailView();
    } else if (table === 'event_attendance') {
        if (currentView === 'manage-event') loadEventDetailView();
    }
    
    initializeDashboard();
}

// Load Database from LocalStorage
function loadDatabase() {
    // Initialize client
    initSupabase();

    // One-time database reset triggered programmatically to clear default seeded data
    if (!localStorage.getItem('fms_flushed_v7')) {
        localStorage.clear();
        localStorage.setItem('fms_flushed_v7', 'true');
    }

    db.students = safeJSONParse(localStorage.getItem(DB_KEYS.STUDENTS));
    db.fines = safeJSONParse(localStorage.getItem(DB_KEYS.FINES));
    db.violations = safeJSONParse(localStorage.getItem(DB_KEYS.VIOLATIONS));
    db.auditTrail = safeJSONParse(localStorage.getItem(DB_KEYS.AUDIT_TRAIL));
    db.loginLog = safeJSONParse(localStorage.getItem(DB_KEYS.ADMIN_LOGIN_LOG));
    db.actionLog = safeJSONParse(localStorage.getItem(DB_KEYS.ADMIN_ACTION_LOG));
    db.events = safeJSONParse(localStorage.getItem(DB_KEYS.EVENTS));
    db.eventAttendance = safeJSONParse(localStorage.getItem(DB_KEYS.EVENT_ATTENDANCE));
    db.eventViolationCategories = safeJSONParse(localStorage.getItem(DB_KEYS.EVENT_VIOLATION_CATEGORIES));

    const settingsStr = localStorage.getItem(DB_KEYS.COHORT_SETTINGS);
    if (settingsStr) {
        db.cohortSettings = safeJSONParse(settingsStr, db.cohortSettings);
    } else {
        localStorage.setItem(DB_KEYS.COHORT_SETTINGS, JSON.stringify(db.cohortSettings));
    }

    // If empty, run seeders to pre-populate mock data
    if (db.violations.length === 0) {
        seedViolationCategories();
    }
    
    // Auto-purge checker (Soft deleted records removed after 30 days)
    runAutoPurge();
}

// Save specific table to LocalStorage
function saveTable(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// Log admin action to database
function logAdminAction(actionType, entityType, entityId, details) {
    const admin = getActiveAdmin();
    const action = {
        id: generateUUID(),
        admin_username: admin ? admin.username : 'system',
        action_type: actionType, 
        entity_type: entityType, 
        entity_id: entityId,
        timestamp: new Date().toISOString(),
        details: typeof details === 'object' ? JSON.stringify(details) : details
    };
    db.actionLog.unshift(action); 
    saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
    pushToCloud('action_log', action);
    
    if (currentView === 'audit') {
        loadAuditLogs();
    }
}

// Log fine field changes to FineAuditTrail
function logFineEdit(fineId, changedField, oldValue, newValue, changeType, actionNote = '', save = true) {
    const audit = {
        id: generateUUID(),
        fine_id: fineId,
        changed_field: changedField, 
        old_value: oldValue !== null && oldValue !== undefined ? oldValue.toString() : '',
        new_value: newValue !== null && newValue !== undefined ? newValue.toString() : '',
        change_timestamp: new Date().toISOString(),
        change_type: changeType, 
        admin_action_note: actionNote
    };
    db.auditTrail.unshift(audit);
    if (save) {
        saveTable(DB_KEYS.AUDIT_TRAIL, db.auditTrail);
        pushToCloud('audit_trail', audit);
    }
}

// 30-Day Auto Purge for soft-deleted records
function runAutoPurge() {
    const now = new Date();
    const purgeThreshold = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
    let changed = false;

    // Purge Soft-Deleted Students
    const initialStudentsCount = db.students.length;
    db.students = db.students.filter(student => {
        if (student.is_deleted && student.deleted_at) {
            const deletedTime = new Date(student.deleted_at);
            if (now - deletedTime > purgeThreshold) {
                // Cascading delete student's fines
                db.fines = db.fines.filter(fine => fine.student_id !== student.id);
                changed = true;
                return false;
            }
        }
        return true;
    });
    if (db.students.length !== initialStudentsCount) {
        saveTable(DB_KEYS.STUDENTS, db.students);
    }

    // Purge Soft-Deleted Fines
    const initialFinesCount = db.fines.length;
    db.fines = db.fines.filter(fine => {
        if (fine.is_deleted && fine.deleted_at) {
            const deletedTime = new Date(fine.deleted_at);
            if (now - deletedTime > purgeThreshold) {
                changed = true;
                return false;
            }
        }
        return true;
    });
    if (db.fines.length !== initialFinesCount) {
        saveTable(DB_KEYS.FINES, db.fines);
        changed = true;
    }
    
    if (changed) {
        saveTable(DB_KEYS.FINES, db.fines);
        logAdminAction('AUTO_PURGE', 'SYSTEM', null, 'Automated 30-day soft-deleted records purging completed.');
    }
}

// ==========================================
// 2. DATA SEEDERS
// ==========================================

function seedViolationCategories() {
    const categories = [
        // SUMMER PLACEMENTS
        // 1. Placement Committee Rules Violation Before Recruiter
        {
            id: 'V_SUM_1_1',
            category_name: 'Video Off/False Presence (Before Recruiter)',
            parent_category: 'Rules Violation Before Recruiter',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Video Off/False Presence in any round of placement process/Pre-Placement Talk/Placement Committee mandated G.L.'
        },
        {
            id: 'V_SUM_1_2',
            category_name: 'Dress Code/Grooming Breach (Before Recruiter)',
            parent_category: 'Rules Violation Before Recruiter',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 2000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Dress code/Proper Grooming Rules not followed in any placement round (₹2,000 per round) or PC mandated G.L. (₹2,000)'
        },
        {
            id: 'V_SUM_1_3',
            category_name: 'Absence in Pre-Placement Talk (Before Recruiter)',
            parent_category: 'Rules Violation Before Recruiter',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 1,
            combination_type: 'BOTH',
            description: 'Absence in Pre-Placement Talk'
        },
        {
            id: 'V_SUM_1_4',
            category_name: 'Absence in PC Mandated Meeting (Before Recruiter)',
            parent_category: 'Rules Violation Before Recruiter',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 2000,
            red_flag_count: 1,
            combination_type: 'BOTH',
            description: 'Absence in PC mandated GL/GBM/Any other talk'
        },
        {
            id: 'V_SUM_1_5',
            category_name: 'Late Attendance (Before Recruiter)',
            parent_category: 'Rules Violation Before Recruiter',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 1500,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Joining Leadership Talks, GLS, PrePlacement Talk late, General Body Meeting late'
        },
        {
            id: 'V_SUM_1_6',
            category_name: 'Video Frame Error (Before Recruiter)',
            parent_category: 'Rules Violation Before Recruiter',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 2000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Video frame wrong (full face not visible) in PrePlacement Talk/PC mandated GL'
        },
        {
            id: 'V_SUM_1_7',
            category_name: 'Mobile/Earphones Usage (Before Recruiter)',
            parent_category: 'Rules Violation Before Recruiter',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 2000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Using Mobile Phones/Tablets/Laptops/Earphones during Leadership Talk, GLs, PrePlacement Talk'
        },
        {
            id: 'V_SUM_1_8',
            category_name: 'Misbehavior (Before Recruiter)',
            parent_category: 'Rules Violation Before Recruiter',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 1,
            combination_type: 'BOTH',
            description: 'Misbehaviour in any round of placement process/Pre-Placement Talk/PC mandated G.L.'
        },
        {
            id: 'V_SUM_1_9',
            category_name: 'Misbehavior with CDS/PC (Before Recruiter)',
            parent_category: 'Rules Violation Before Recruiter',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 5000,
            red_flag_count: 1,
            combination_type: 'BOTH',
            description: 'Misbehaviour with recruiters/CDS members/PC members during placement process'
        },
        // 2. Placement Committee Rules Violation During Placement Process
        {
            id: 'V_SUM_2_1',
            category_name: 'Late to Interview (During Process)',
            parent_category: 'Rules Violation During Placement Process',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Joining Interview/G.D. any round or interaction with Recruiter late'
        },
        {
            id: 'V_SUM_2_2',
            category_name: 'Missing Interview (During Process)',
            parent_category: 'Rules Violation During Placement Process',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: null,
            red_flag_count: 3,
            combination_type: 'RED_FLAG_ONLY',
            description: 'Missing Interview/G.D./any round or interaction with Recruiter (Removal from placement pool)'
        },
        {
            id: 'V_SUM_2_3',
            category_name: 'No Submission After Application (During Process)',
            parent_category: 'Rules Violation During Placement Process',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 1,
            combination_type: 'BOTH',
            description: 'Applying for company and not making submission'
        },
        {
            id: 'V_SUM_2_4',
            category_name: 'Process Tanking (During Process)',
            parent_category: 'Rules Violation During Placement Process',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: null,
            red_flag_count: 3,
            combination_type: 'RED_FLAG_ONLY',
            description: 'Purposeful tanking of process/intentional underperformance (Removal from placement pool)'
        },
        {
            id: 'V_SUM_2_5',
            category_name: 'Outside Executive Interaction (During Process)',
            parent_category: 'Rules Violation During Placement Process',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 2000,
            red_flag_count: 1,
            combination_type: 'BOTH',
            description: 'Attempting to interact with company executives outside scheduled interview time'
        },
        {
            id: 'V_SUM_2_6',
            category_name: 'Disinterest Expressed to Recruiter (During Process)',
            parent_category: 'Rules Violation During Placement Process',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: null,
            red_flag_count: 3,
            combination_type: 'RED_FLAG_ONLY',
            description: 'Deliberately expressing disinterest in role applied for in front of recruiter (Removal from placement pool)'
        },
        {
            id: 'V_SUM_2_7',
            category_name: 'Policy Timeline & Dissemination Breach (During Process)',
            parent_category: 'Rules Violation During Placement Process',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 10000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Policy violation with respect to timelines, sharing, circulating, disseminating placement info (Banning next 5 companies + ₹10,000)'
        },
        // 3. Placement Committee Policy Violation
        {
            id: 'V_SUM_3_1',
            category_name: 'WhatsApp Naming/Group delay (Policy)',
            parent_category: 'Placement Committee Policy Violation',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 1000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Failure to join WhatsApp Group on time/Not adhering to WhatsApp naming convention'
        },
        {
            id: 'V_SUM_3_2',
            category_name: 'Falsifying Attendance (Policy)',
            parent_category: 'Placement Committee Policy Violation',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 2000,
            red_flag_count: 1,
            combination_type: 'BOTH',
            description: 'Failure to meet attendance requirements or falsifying attendance'
        },
        {
            id: 'V_SUM_3_3',
            category_name: 'Details Furnishing Delay (Policy)',
            parent_category: 'Placement Committee Policy Violation',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 1,
            combination_type: 'BOTH',
            description: 'Delay in furnishing details or non-compliance'
        },
        {
            id: 'V_SUM_3_4',
            category_name: 'Off-campus Apply without NOC (Policy)',
            parent_category: 'Placement Committee Policy Violation',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 5000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Applying for off-campus opportunities without valid NOC'
        },
        {
            id: 'V_SUM_3_5',
            category_name: 'Media Blackout Breach (Policy)',
            parent_category: 'Placement Committee Policy Violation',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 10000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Breach of Media Blackout Policy (Banning next 5 companies + ₹10,000)'
        },
        // 4. Resume Rules Violation
        {
            id: 'V_SUM_4_1',
            category_name: 'AI Usage in Resume (Resume)',
            parent_category: 'Resume Rules Violation',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 5000,
            red_flag_count: 1,
            combination_type: 'BOTH',
            description: 'Use of AI in violation of placement guidelines'
        },
        {
            id: 'V_SUM_4_2',
            category_name: 'Multiple Resume Versions (Resume)',
            parent_category: 'Resume Rules Violation',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: null,
            red_flag_count: 3,
            combination_type: 'RED_FLAG_ONLY',
            description: 'Attempt to use different versions of resume (Direct sign-out and ban from placements)'
        },
        {
            id: 'V_SUM_4_3',
            category_name: 'Unapproved Resume Application (Resume)',
            parent_category: 'Resume Rules Violation',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Attempt to apply with unapproved resume'
        },
        {
            id: 'V_SUM_4_4',
            category_name: 'Falsifying Resume Pointers (Resume)',
            parent_category: 'Resume Rules Violation',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Falsifying certificates or resume pointers'
        },
        // 5. Placement Training & Preparation
        {
            id: 'V_SUM_5_1',
            category_name: 'Corporate Competitions Ignored (Training)',
            parent_category: 'Placement Training & Preparation',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 1500,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Not applying for mandatory corporate competitions/not making submissions'
        },
        {
            id: 'V_SUM_5_2',
            category_name: 'Recruiter Commitment Ignored (Training)',
            parent_category: 'Placement Training & Preparation',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Not responding to recruiter/not working/honouring commitment'
        },
        {
            id: 'V_SUM_5_3',
            category_name: 'Non-submission of data/info for case competitions',
            parent_category: 'Placement Training & Preparation',
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: 1500,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Failure to submit required data or information for case competitions or corporate challenges'
        },

        // FINAL PLACEMENTS
        // 1. Placement Committee Rules Violation Before Recruiter
        {
            id: 'V_FIN_1_1',
            category_name: 'Video Off/False Presence (Before Recruiter)',
            parent_category: 'Placement Committee Rules Violation Before Recruiter',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Video Off/False Presence in any round'
        },
        {
            id: 'V_FIN_1_2',
            category_name: 'Dress Code/Grooming Breach (Before Recruiter)',
            parent_category: 'Placement Committee Rules Violation Before Recruiter',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Dress code/Proper Grooming Rules not followed (₹3,000) or PC mandated GL (₹2,000)'
        },
        {
            id: 'V_FIN_1_3',
            category_name: 'Absence in Pre-Placement Talk (Before Recruiter)',
            parent_category: 'Placement Committee Rules Violation Before Recruiter',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Absence in Pre-Placement Talk'
        },
        {
            id: 'V_FIN_1_4',
            category_name: 'Absence in PC Mandated Meeting (Before Recruiter)',
            parent_category: 'Placement Committee Rules Violation Before Recruiter',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 2000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Absence in PC mandated GL/GBM/Any other talk'
        },
        {
            id: 'V_FIN_1_5',
            category_name: 'Mobile/Earphones Usage (Before Recruiter)',
            parent_category: 'Placement Committee Rules Violation Before Recruiter',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 2000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Using Mobile Phones/Tablets/Laptops/Earphones'
        },
        {
            id: 'V_FIN_1_6',
            category_name: 'Misbehavior (Before Recruiter)',
            parent_category: 'Placement Committee Rules Violation Before Recruiter',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Misbehaviour in any round of placement process'
        },
        {
            id: 'V_FIN_1_7',
            category_name: 'Misbehavior with CDS/PC (Before Recruiter)',
            parent_category: 'Placement Committee Rules Violation Before Recruiter',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 5000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Misbehaviour with any of recruiters/CDS members/PC members'
        },
        // 2. Placement Committee Rules Violation During Placement Process
        {
            id: 'V_FIN_2_1',
            category_name: 'Late to Interview (During Process)',
            parent_category: 'Placement Committee Rules Violation During Placement Process',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Joining Interview/G.D. late'
        },
        {
            id: 'V_FIN_2_2',
            category_name: 'Missing Interview (During Process)',
            parent_category: 'Placement Committee Rules Violation During Placement Process',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: null,
            red_flag_count: 3,
            combination_type: 'RED_FLAG_ONLY',
            description: 'Missing Interview/G.D. (Removal from placement pool)'
        },
        {
            id: 'V_FIN_2_3',
            category_name: 'No Submission After Application (During Process)',
            parent_category: 'Placement Committee Rules Violation During Placement Process',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 5000,
            red_flag_count: 1,
            combination_type: 'BOTH',
            description: 'Applying for company and not making submission'
        },
        {
            id: 'V_FIN_2_4',
            category_name: 'Process Tanking (During Process)',
            parent_category: 'Placement Committee Rules Violation During Placement Process',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: null,
            red_flag_count: 3,
            combination_type: 'RED_FLAG_ONLY',
            description: 'Purposeful tanking of process/intentional underperformance (Removal from placement pool)'
        },
        {
            id: 'V_FIN_2_5',
            category_name: 'Outside Executive Interaction (During Process)',
            parent_category: 'Placement Committee Rules Violation During Placement Process',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 2000,
            red_flag_count: 1,
            combination_type: 'BOTH',
            description: 'Attempting to interact with company executives outside scheduled interview time'
        },
        {
            id: 'V_FIN_2_6',
            category_name: 'Disinterest Expressed (During Process)',
            parent_category: 'Placement Committee Rules Violation During Placement Process',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: null,
            red_flag_count: 3,
            combination_type: 'RED_FLAG_ONLY',
            description: 'Deliberately expressing disinterest in role applied for (Removal from placement pool)'
        },
        // 3. Placement Committee Policy Violation
        {
            id: 'V_FIN_3_1',
            category_name: 'WhatsApp Naming/Group delay (Policy)',
            parent_category: 'Placement Committee Policy Violation',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 1000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Failure to join WhatsApp Group on time/Not adhering to naming convention'
        },
        {
            id: 'V_FIN_3_2',
            category_name: 'Falsifying Attendance (Policy)',
            parent_category: 'Placement Committee Policy Violation',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 2000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Failure to meet attendance requirements or falsifying attendance'
        },
        {
            id: 'V_FIN_3_3',
            category_name: 'Details Furnishing Delay (Policy)',
            parent_category: 'Placement Committee Policy Violation',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Delay in furnishing details or non-compliance'
        },
        {
            id: 'V_FIN_3_4',
            category_name: 'Off-campus Apply without NOC (Policy)',
            parent_category: 'Placement Committee Policy Violation',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 5000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Applying for off-campus opportunities without valid NOC'
        },
        {
            id: 'V_FIN_3_5',
            category_name: 'Media Blackout Breach (Policy)',
            parent_category: 'Placement Committee Policy Violation',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 10000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Breach of Media Blackout Policy (Banning next 5 companies + ₹10,000)'
        },
        // 4. Resume Rules Violation
        {
            id: 'V_FIN_4_1',
            category_name: 'Multiple Resume Versions (Resume)',
            parent_category: 'Final Placements - Category: Resume Rules Violation',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: null,
            red_flag_count: 3,
            combination_type: 'RED_FLAG_ONLY',
            description: 'Attempt to use different versions of resume (Direct sign-out and ban from placements)'
        },
        {
            id: 'V_FIN_4_2',
            category_name: 'Unapproved Resume Application (Resume)',
            parent_category: 'Final Placements - Category: Resume Rules Violation',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Attempt to apply with unapproved resume'
        },
        {
            id: 'V_FIN_4_3',
            category_name: 'Falsifying Resume Pointers (Resume)',
            parent_category: 'Final Placements - Category: Resume Rules Violation',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 3000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Falsifying certificates or resume pointers'
        },
        {
            id: 'V_FIN_5_1',
            category_name: 'Non-submission of data/info for case competitions',
            parent_category: 'Placement Training & Preparation',
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: 2000,
            red_flag_count: 0,
            combination_type: 'MONETARY_ONLY',
            description: 'Failure to submit required data or information for case competitions or corporate challenges'
        }
    ];

    db.violations = categories;
    saveTable(DB_KEYS.VIOLATIONS, db.violations);
}

function seedStudentsAndFines() {
    // Generate 55 Summer students, 55 Final students
    const firstNames = ['Ananya', 'Rahul', 'Kavitha', 'Vikram', 'Aditya', 'Sneha', 'Rohan', 'Pooja', 'Amit', 'Divya', 'Sanjay', 'Neha', 'Abhishek', 'Meera', 'Rajesh', 'Priya', 'Kiran', 'Deepak', 'Jyoti', 'Harish', 'Sunita', 'Vijay', 'Asha', 'Arun', 'Ritu', 'Manoj', 'Swati', 'Suresh', 'Geeta', 'Anil', 'Rekha', 'Ramesh', 'Shanti', 'Dilip', 'Lata', 'Vinod', 'Usha', 'Pradeep', 'Prem', 'Nirmala', 'Karthik', 'Aishwarya', 'Ganesh', 'Lakshmi', 'Nikhil', 'Shreya', 'Varun', 'Meghna', 'Siddharth', 'Tanvi', 'Abhay', 'Kriti', 'Pranav', 'Riya', 'Ishaan'];
    const lastNames = ['Rao', 'Sharma', 'Krishnan', 'Malhotra', 'Gupta', 'Patel', 'Verma', 'Joshi', 'Mehta', 'Nair', 'Singh', 'Choudhury', 'Sen', 'Das', 'Reddy', 'Pillai', 'Iyer', 'Bose', 'Chatterjee', 'Roy', 'Prasad', 'Mishra', 'Pandey', 'Saxena', 'Trivedi', 'Bhat', 'Shetty', 'Deshmukh', 'Kulkarni', 'Dubey', 'Yadav', 'Maurya', 'Gill', 'Vance', 'Kapoor', 'Khanna', 'Oberoi', 'Bakshi', 'Sarin', 'Nanda', 'Sood', 'Madan', 'Bajaj', 'Grover', 'Anand', 'Taneja', 'Bahl', 'Kohli', 'Chawla', 'Suri'];

    const summerStudents = [];
    const finalStudents = [];
    
    // Create Summer Cohort (2026-27)
    for (let i = 1; i <= 55; i++) {
        const fname = firstNames[i % firstNames.length];
        const lname = lastNames[(i * 3) % lastNames.length];
        const name = `${fname} ${lname}`;
        const rollSuffix = i.toString().padStart(3, '0');
        const roll_number = `PGP2026S${rollSuffix}`;
        const email_id = `${fname.toLowerCase()}.${lname.toLowerCase()}${i}@iimv.ac.in`;
        
        summerStudents.push({
            id: `S_SUM_${i}`,
            name,
            roll_number,
            email_id,
            cohort: 'SUMMER_2026_27',
            created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            is_deleted: false,
            deleted_at: null
        });
    }

    // Create Final Cohort (2026-27)
    for (let i = 1; i <= 55; i++) {
        const fname = firstNames[(i * 2) % firstNames.length];
        const lname = lastNames[(i * 5) % lastNames.length];
        const name = `${fname} ${lname}`;
        const rollSuffix = i.toString().padStart(3, '0');
        const roll_number = `PGP2026F${rollSuffix}`;
        const email_id = `${fname.toLowerCase()}.${lname.toLowerCase()}${i + 100}@iimv.ac.in`;
        
        finalStudents.push({
            id: `S_FIN_${i}`,
            name,
            roll_number,
            email_id,
            cohort: 'FINAL_2026_27',
            created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            is_deleted: false,
            deleted_at: null
        });
    }

    // Add 2 soft-deleted students in each cohort for history view testing
    summerStudents.push({
        id: `S_SUM_DEL_1`,
        name: 'Amit Kumar (Deleted)',
        roll_number: 'PGP2026S098',
        email_id: 'amit.deleted@iimv.ac.in',
        cohort: 'SUMMER_2026_27',
        created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        is_deleted: true,
        deleted_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    });
    
    finalStudents.push({
        id: `S_FIN_DEL_1`,
        name: 'Sarah Joseph (Deleted)',
        roll_number: 'PGP2026F099',
        email_id: 'sarah.deleted@iimv.ac.in',
        cohort: 'FINAL_2026_27',
        created_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        is_deleted: true,
        deleted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    });

    db.students = [...summerStudents, ...finalStudents];
    saveTable(DB_KEYS.STUDENTS, db.students);

    // Create 200+ Fines (approx. 110 for Summer, 100 for Final)
    const fines = [];
    const statuses = ['OPEN', 'CLOSED', 'CARRIED_FORWARD'];
    const closureReasons = ['Payment Received', 'Waived', 'Dispute Resolved', 'Administrative Action'];
    
    // Helper to get violation category details
    const summerCats = db.violations.filter(v => v.cohort === 'SUMMER_2026_27');
    const finalCats = db.violations.filter(v => v.cohort === 'FINAL_2026_27');

    // Seed Fines for Summer Students (110 records)
    let fineCounter = 1;
    for (let i = 0; i < 110; i++) {
        // Pick student (looping)
        const studentIndex = i % 55;
        const student = summerStudents[studentIndex];
        // Pick category
        const cat = summerCats[i % summerCats.length];
        const status = statuses[i % statuses.length];
        
        const monetaryPenalty = cat.monetary_penalty_amount || 0;
        const redFlags = cat.red_flag_count || 0;
        
        const isClosed = status === 'CLOSED';
        const createdAt = new Date(Date.now() - (40 - (i % 30)) * 24 * 60 * 60 * 1000);
        const closedAt = isClosed ? new Date(createdAt.getTime() + (3 * 24 * 60 * 60 * 1000)).toISOString() : null;
        
        const fineId = `F_SUM_${fineCounter++}`;
        fines.push({
            id: fineId,
            student_id: student.id,
            violation_category_id: cat.id,
            cohort: 'SUMMER_2026_27',
            monetary_penalty_amount: monetaryPenalty,
            red_flags: redFlags,
            status: status,
            differentiation_tag: `Violation-${i % 2 + 1}`,
            notes_comments: `Automated seed fine for ${cat.category_name}.`,
            created_at: createdAt.toISOString(),
            closed_at: closedAt,
            is_deleted: false,
            deleted_at: null
        });

        // Seed audit logs
        logFineEdit(fineId, 'status', 'OPEN', status, 'CREATED', 'Initial seeding registration', false);
        if (isClosed) {
            logFineEdit(fineId, 'status', 'OPEN', 'CLOSED', 'STATUS_CHANGED', `Closure via ${closureReasons[i % closureReasons.length]} during seeding`, false);
        }
    }

    // Seed Fines for Final Students (100 records)
    for (let i = 0; i < 100; i++) {
        const studentIndex = i % 55;
        const student = finalStudents[studentIndex];
        const cat = finalCats[i % finalCats.length];
        const status = statuses[(i + 1) % statuses.length];
        
        const monetaryPenalty = cat.monetary_penalty_amount || 0;
        const redFlags = cat.red_flag_count || 0;
        
        const isClosed = status === 'CLOSED';
        const createdAt = new Date(Date.now() - (35 - (i % 25)) * 24 * 60 * 60 * 1000);
        const closedAt = isClosed ? new Date(createdAt.getTime() + (4 * 24 * 60 * 60 * 1000)).toISOString() : null;
        
        const fineId = `F_FIN_${fineCounter++}`;
        fines.push({
            id: fineId,
            student_id: student.id,
            violation_category_id: cat.id,
            cohort: 'FINAL_2026_27',
            monetary_penalty_amount: monetaryPenalty,
            red_flags: redFlags,
            status: status,
            differentiation_tag: `Violation-${i % 2 + 1}`,
            notes_comments: `Automated seed fine for ${cat.category_name}.`,
            created_at: createdAt.toISOString(),
            closed_at: closedAt,
            is_deleted: false,
            deleted_at: null
        });

        // Seed audit logs
        logFineEdit(fineId, 'status', 'OPEN', status, 'CREATED', 'Initial seeding registration', false);
        if (isClosed) {
            logFineEdit(fineId, 'status', 'OPEN', 'CLOSED', 'STATUS_CHANGED', `Closure via ${closureReasons[i % closureReasons.length]} during seeding`, false);
        }
    }

    // Add a couple of soft-deleted fines
    const delFineId1 = `F_DEL_1`;
    fines.push({
        id: delFineId1,
        student_id: summerStudents[0].id,
        violation_category_id: summerCats[0].id,
        cohort: 'SUMMER_2026_27',
        monetary_penalty_amount: 3000,
        red_flags: 0,
        status: 'OPEN',
        differentiation_tag: 'Violation-Del-1',
        notes_comments: 'Deleted fine for testing',
        created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        closed_at: null,
        is_deleted: true,
        deleted_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
    });
    logFineEdit(delFineId1, 'status', 'OPEN', 'DELETED', 'DELETED', 'Soft-deleted by seeding script', false);

    const delFineId2 = `F_DEL_2`;
    fines.push({
        id: delFineId2,
        student_id: finalStudents[0].id,
        violation_category_id: finalCats[0].id,
        cohort: 'FINAL_2026_27',
        monetary_penalty_amount: 3000,
        red_flags: 0,
        status: 'OPEN',
        differentiation_tag: 'Violation-Del-2',
        notes_comments: 'Deleted fine for testing',
        created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        closed_at: null,
        is_deleted: true,
        deleted_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    });
    logFineEdit(delFineId2, 'status', 'OPEN', 'DELETED', 'DELETED', 'Soft-deleted by seeding script', false);

    db.fines = fines;
    saveTable(DB_KEYS.FINES, db.fines);
    saveTable(DB_KEYS.AUDIT_TRAIL, db.auditTrail);
    
    // Seed initial Admin Login logs
    db.loginLog = [
        {
            id: generateUUID(),
            admin_username: 'admin',
            login_timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
            logout_timestamp: null,
            ip_address: '127.0.0.1'
        }
    ];
    saveTable(DB_KEYS.ADMIN_LOGIN_LOG, db.loginLog);
    
    // Seed initial Admin Action logs
    const seedActions = [
        { id: generateUUID(), admin_username: 'system', action_type: 'BULK_IMPORT', entity_type: 'BULK_UPLOAD', entity_id: 'STUDENTS', timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), details: 'Successfully seeded default student master records (110 students).' },
        { id: generateUUID(), admin_username: 'system', action_type: 'BULK_IMPORT', entity_type: 'BULK_UPLOAD', entity_id: 'FINES', timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), details: 'Successfully seeded default placement fines (210 fines).' }
    ];
    db.actionLog = [...seedActions];
    saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
}

// ==========================================
// 3. AUTHENTICATION & LOGIN MANAGEMENT
// ==========================================

function getActiveAdmin() {
    const adminSession = sessionStorage.getItem('fms_session');
    return adminSession ? JSON.parse(adminSession) : null;
}

function getAdminName() {
    const active = getActiveAdmin();
    return active ? active.name : 'System Admin';
}

function getCohortDisplayLabel(cohortKey) {
    if (!cohortKey) return 'N/A';
    if (cohortKey.includes(',')) {
        // Multi-cohort comma list
        return cohortKey.split(',').map(c => getCohortDisplayLabel(c.trim())).join(', ');
    }
    const cleanKey = cohortKey.trim().toUpperCase();
    if (cleanKey === 'SUMMER_2026_27' || cleanKey.startsWith('SUMMER')) {
        const year = db.cohortSettings.summerYear ? ` (${db.cohortSettings.summerYear})` : '';
        return `Summers${year}`;
    }
    if (cleanKey === 'FINAL_2026_27' || cleanKey.startsWith('FINAL')) {
        const year = db.cohortSettings.finalYear ? ` (${db.cohortSettings.finalYear})` : '';
        return `Finals${year}`;
    }
    return cohortKey;
}

function checkAuthentication() {
    const activeAdmin = getActiveAdmin();
    const loginScreen = document.getElementById('loginScreen');
    const appInterface = document.getElementById('appInterface');

    if (activeAdmin) {
        loginScreen.style.display = 'none';
        appInterface.style.display = 'flex';
        document.getElementById('adminName').innerText = activeAdmin.name;
        // Seed first letters of name to avatar
        document.getElementById('adminAvatar').innerText = activeAdmin.name.split(' ').map(n => n[0]).join('');
        
        // Refresh calculations and UI tables
        initializeDashboard();
        loadStudentList();
        loadFineList();
        loadAuditLogs();
        populateViolationCategorySelects();
    } else {
        loginScreen.style.display = 'flex';
        appInterface.style.display = 'none';
    }
}

safeAddListener('loginForm', 'submit', function(e) {
    e.preventDefault();
    const userVal = document.getElementById('username').value.trim();
    const passVal = document.getElementById('password').value;
    const errorAlert = document.getElementById('loginErrorAlert');

    if (userVal === DEFAULT_ADMIN.username && passVal === DEFAULT_ADMIN.password) {
        errorAlert.style.display = 'none';
        const sessionData = {
            username: userVal,
            name: DEFAULT_ADMIN.name,
            loginTime: new Date().toISOString()
        };
        sessionStorage.setItem('fms_session', JSON.stringify(sessionData));
        
        // Log in DB audit tables
        const loginRecord = {
            id: generateUUID(),
            admin_username: userVal,
            login_timestamp: new Date().toISOString(),
            logout_timestamp: null,
            ip_address: '127.0.0.1' // local client mock
        };
        db.loginLog.unshift(loginRecord);
        saveTable(DB_KEYS.ADMIN_LOGIN_LOG, db.loginLog);
        
        logAdminAction('LOGIN', 'ADMIN', userVal, 'Admin logged in successfully.');
        showToast('Successfully logged in', 'success');
        
        checkAuthentication();
    } else {
        errorAlert.style.display = 'block';
        showToast('Login failed', 'danger');
    }
});

function logout() {
    const admin = getActiveAdmin();
    if (admin) {
        // Mark logout timestamp
        const activeLogin = db.loginLog.find(l => l.admin_username === admin.username && l.logout_timestamp === null);
        if (activeLogin) {
            activeLogin.logout_timestamp = new Date().toISOString();
            saveTable(DB_KEYS.ADMIN_LOGIN_LOG, db.loginLog);
        }
        logAdminAction('LOGOUT', 'ADMIN', admin.username, 'Admin logged out.');
        sessionStorage.removeItem('fms_session');
    }
    checkAuthentication();
}

// ==========================================
// 4. ROUTING & VIEW NAVIGATION
// ==========================================

let currentView = 'dashboard';
let currentSelectedEventId = null;
let currentEventDetailTab = 'FINED'; // FINED or REGISTERED

function switchView(viewName) {
    currentView = viewName;
    
    // Toggle active sidebar link
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => el.classList.remove('active'));
    
    // Toggle visible view segment
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    
    const viewTitle = document.getElementById('viewTitle');
    const viewSubtitle = document.getElementById('viewSubtitle');
    
    // Hide manage event navigation tab if we are switching to other main views
    if (viewName !== 'manage-event') {
        document.getElementById('navManageEvent').style.display = 'none';
    }
    
    if (viewName === 'dashboard') {
        document.getElementById('navDashboard').classList.add('active');
        document.getElementById('viewDashboard').classList.add('active');
        viewTitle.innerText = 'Dashboard';
        viewSubtitle.innerText = 'Placement Fines & Red Flags Summary';
        initializeDashboard();
    } else if (viewName === 'students') {
        document.getElementById('navStudentMaster').classList.add('active');
        document.getElementById('viewStudentMaster').classList.add('active');
        viewTitle.innerText = 'Student Master';
        viewSubtitle.innerText = 'Manage student cohorts, profiles, and historical status';
        loadStudentList();
    } else if (viewName === 'fines') {
        document.getElementById('navFineManagement').classList.add('active');
        document.getElementById('viewFineManagement').classList.add('active');
        viewTitle.innerText = 'Fines Registry';
        viewSubtitle.innerText = 'Register placement policy violations, payments, and carries';
        loadFineList();
    } else if (viewName === 'audit') {
        document.getElementById('navAuditLogs').classList.add('active');
        document.getElementById('viewAuditLogs').classList.add('active');
        viewTitle.innerText = 'Compliance Logs';
        viewSubtitle.innerText = 'System activity history and administrator transaction logs';
        loadAuditLogs();
    } else if (viewName === 'events') {
        document.getElementById('navViewEvents').classList.add('active');
        document.getElementById('viewEvents').classList.add('active');
        viewTitle.innerText = 'Placement Events';
        viewSubtitle.innerText = 'Create and manage placement-related events and attendance lists';
        
        // Populate category filter dropdown
        const categoryFilter = document.getElementById('eventCategoryFilter');
        if (categoryFilter) {
            categoryFilter.innerHTML = '<option value="">All Categories</option>';
            const uniqueCategories = Array.from(new Set(db.violations.map(v => v.category_name)));
            uniqueCategories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.innerText = cat;
                categoryFilter.appendChild(opt);
            });
        }
        
        loadEventsList();

    } else if (viewName === 'manage-event') {
        document.getElementById('navManageEvent').style.display = 'block';
        document.getElementById('navManageEvent').classList.add('active');
        document.getElementById('viewManageEvent').classList.add('active');
        viewTitle.innerText = 'Manage Event';
        viewSubtitle.innerText = 'View attendance lists, auto-flagging records, and proof status';
        loadEventDetailView();
    } else if (viewName === 'red-flags') {
        document.getElementById('navRedFlags').classList.add('active');
        document.getElementById('viewRedFlags').classList.add('active');
        viewTitle.innerText = 'Red Flag Registry';
        viewSubtitle.innerText = 'Consolidated cohort tracker for multiple placement policy violations';
        loadRedFlagsRegistry();
    } else if (viewName === 'cohort-master') {
        document.getElementById('navCohortMaster').classList.add('active');
        document.getElementById('viewCohortMaster').classList.add('active');
        viewTitle.innerText = 'Cohort Master';
        viewSubtitle.innerText = 'Configure academic batch year parameters and roll number prefix mappings';
        loadCohortMasterView();
    }
}

// ==========================================
// 5. DASHBOARD MODULE
// ==========================================

function initializeDashboard() {
    // 1. Calculate combined/unified metrics
    const activeFines = db.fines.filter(f => !f.is_deleted);
    const openFines = activeFines.filter(f => f.status === 'OPEN' || f.status === 'PROOF_SUBMITTED');
    
    // Combined outstanding pending amount
    const combinedPendingAmountSum = openFines.reduce((sum, f) => sum + (f.monetary_penalty_amount || 0), 0);
    const combinedPendingAmountEl = document.getElementById('combinedPendingAmount');
    if (combinedPendingAmountEl) combinedPendingAmountEl.innerText = formatINR(combinedPendingAmountSum);

    // At-Risk Students (3+ flags)
    const studentCumulativeFlags = {};
    activeFines.forEach(f => {
        studentCumulativeFlags[f.student_id] = (studentCumulativeFlags[f.student_id] || 0) + (f.red_flags || 0);
    });
    const atRiskCount = Object.values(studentCumulativeFlags).filter(flags => flags >= 3).length;
    const combinedAtRiskCountEl = document.getElementById('combinedAtRiskCount');
    if (combinedAtRiskCountEl) combinedAtRiskCountEl.innerText = atRiskCount;

    // 2. Summer Cohort Metrics
    const summerFines = activeFines.filter(f => f.cohort === 'SUMMER_2026_27');
    
    // Direct manual vs Event-centric
    const summerDirectFines = summerFines.filter(f => f.source === 'DIRECT_MANUAL');
    const summerEventFines = summerFines.filter(f => f.source === 'EVENT_AUTO');
    
    const sipTotalDirectFinesEl = document.getElementById('sipTotalDirectFines');
    if (sipTotalDirectFinesEl) sipTotalDirectFinesEl.innerText = summerDirectFines.length;

    const sipOpenDirectFinesEl = document.getElementById('sipOpenDirectFines');
    if (sipOpenDirectFinesEl) sipOpenDirectFinesEl.innerText = summerDirectFines.filter(f => f.status === 'OPEN').length;

    const sipClosedDirectFinesEl = document.getElementById('sipClosedDirectFines');
    if (sipClosedDirectFinesEl) sipClosedDirectFinesEl.innerText = summerDirectFines.filter(f => f.status === 'CLOSED').length;

    const sipCarriedDirectFinesEl = document.getElementById('sipCarriedDirectFines');
    if (sipCarriedDirectFinesEl) sipCarriedDirectFinesEl.innerText = summerDirectFines.filter(f => f.status === 'CARRIED_FORWARD').length;

    // Summer Events
    const summerEvents = db.events.filter(e => e.cohort === 'SUMMER_2026_27' && !e.is_deleted);
    const sipTotalEventsEl = document.getElementById('sipTotalEvents');
    if (sipTotalEventsEl) sipTotalEventsEl.innerText = summerEvents.length;

    const summerEventIds = new Set(summerEvents.map(e => e.id));
    const summerAttendance = db.eventAttendance.filter(a => summerEventIds.has(a.event_id));
    const sipAttendedEventsEl = document.getElementById('sipAttendedEvents');
    if (sipAttendedEventsEl) sipAttendedEventsEl.innerText = summerAttendance.filter(a => a.attendance_status === 'ATTENDED').length;

    const sipAbsentFinedEventsEl = document.getElementById('sipAbsentFinedEvents');
    if (sipAbsentFinedEventsEl) sipAbsentFinedEventsEl.innerText = summerEventFines.length;

    const sipProofsAwaitingEventsEl = document.getElementById('sipProofsAwaitingEvents');
    if (sipProofsAwaitingEventsEl) sipProofsAwaitingEventsEl.innerText = summerEventFines.filter(f => f.status === 'PROOF_SUBMITTED').length;

    // 3. Final Cohort Metrics
    const finalFines = activeFines.filter(f => f.cohort === 'FINAL_2026_27');
    const finalDirectFines = finalFines.filter(f => f.source === 'DIRECT_MANUAL');
    const finalEventFines = finalFines.filter(f => f.source === 'EVENT_AUTO');

    const finalTotalDirectFinesEl = document.getElementById('finalTotalDirectFines');
    if (finalTotalDirectFinesEl) finalTotalDirectFinesEl.innerText = finalDirectFines.length;

    const finalOpenDirectFinesEl = document.getElementById('finalOpenDirectFines');
    if (finalOpenDirectFinesEl) finalOpenDirectFinesEl.innerText = finalDirectFines.filter(f => f.status === 'OPEN').length;

    const finalClosedDirectFinesEl = document.getElementById('finalClosedDirectFines');
    if (finalClosedDirectFinesEl) finalClosedDirectFinesEl.innerText = finalDirectFines.filter(f => f.status === 'CLOSED').length;

    const finalCarriedDirectFinesEl = document.getElementById('finalCarriedDirectFines');
    if (finalCarriedDirectFinesEl) finalCarriedDirectFinesEl.innerText = finalDirectFines.filter(f => f.status === 'CARRIED_FORWARD').length;

    // Final Events
    const finalEvents = db.events.filter(e => e.cohort === 'FINAL_2026_27' && !e.is_deleted);
    const finalTotalEventsEl = document.getElementById('finalTotalEvents');
    if (finalTotalEventsEl) finalTotalEventsEl.innerText = finalEvents.length;

    const finalEventIds = new Set(finalEvents.map(e => e.id));
    const finalAttendance = db.eventAttendance.filter(a => finalEventIds.has(a.event_id));
    const finalAttendedEventsEl = document.getElementById('finalAttendedEvents');
    if (finalAttendedEventsEl) finalAttendedEventsEl.innerText = finalAttendance.filter(a => a.attendance_status === 'ATTENDED').length;

    const finalAbsentFinedEventsEl = document.getElementById('finalAbsentFinedEvents');
    if (finalAbsentFinedEventsEl) finalAbsentFinedEventsEl.innerText = finalEventFines.length;

    const finalProofsAwaitingEventsEl = document.getElementById('finalProofsAwaitingEvents');
    if (finalProofsAwaitingEventsEl) finalProofsAwaitingEventsEl.innerText = finalEventFines.filter(f => f.status === 'PROOF_SUBMITTED').length;

    // 4. Render Top Categories Chart
    renderDashboardChart();

    // 5. Render Action History Log
    renderDashboardActivity();
}

function renderDashboardChart() {
    const chartContainer = document.getElementById('categoryDistributionChart');
    chartContainer.innerHTML = '';
    
    // Group all active open fines by category
    const activeOpenFines = db.fines.filter(f => f.status === 'OPEN' && !f.is_deleted);
    
    const categoryCounts = {};
    activeOpenFines.forEach(fine => {
        const cat = db.violations.find(v => v.id === fine.violation_category_id);
        if (cat) {
            const shortName = cat.category_name.length > 25 ? cat.category_name.substring(0, 22) + '...' : cat.category_name;
            categoryCounts[shortName] = (categoryCounts[shortName] || 0) + 1;
        }
    });

    // Convert to sorted array
    const sortedCategories = Object.entries(categoryCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // top 5
        
    if (sortedCategories.length === 0) {
        chartContainer.innerHTML = `<div class="empty-chart-state">No active open fines to analyze.</div>`;
        return;
    }

    const maxCount = Math.max(...sortedCategories.map(c => c.count));

    sortedCategories.forEach(item => {
        const heightPct = maxCount > 0 ? (item.count / maxCount) * 80 : 10; // clamp to 80% max height
        
        const barWrapper = document.createElement('div');
        barWrapper.className = 'chart-bar-wrapper';
        
        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        bar.style.height = `${heightPct}%`;
        
        // Tooltip
        const tooltip = document.createElement('div');
        bar.appendChild(tooltip);
        tooltip.className = 'chart-bar-tooltip';
        tooltip.innerText = `${item.count} Open Fines`;
        
        const label = document.createElement('div');
        label.className = 'chart-label';
        label.innerText = item.name;
        label.title = item.name;

        barWrapper.appendChild(bar);
        barWrapper.appendChild(label);
        chartContainer.appendChild(barWrapper);
    });
}

function renderDashboardActivity() {
    const container = document.getElementById('dashboardActivityList');
    container.innerHTML = '';
    
    const recentLogs = db.actionLog.slice(0, 10);
    
    if (recentLogs.length === 0) {
        container.innerHTML = `<li class="activity-item" style="color: var(--color-text-secondary); text-align: center; display: block; padding: 20px 0;">No system logs registered.</li>`;
        return;
    }
    
    recentLogs.forEach(log => {
        const item = document.createElement('li');
        
        let iconHtml = '';
        let classType = 'info';
        
        if (log.action_type.includes('CREATED')) {
            classType = 'create';
            iconHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`;
        } else if (log.action_type.includes('EDITED')) {
            classType = 'edit';
            iconHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
        } else if (log.action_type.includes('DELETED')) {
            classType = 'delete';
            iconHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
        } else if (log.action_type.includes('STATUS')) {
            classType = 'status';
            iconHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>`;
        } else {
            iconHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
        }
        
        item.className = `activity-item ${classType}`;
        item.innerHTML = `
            <div class="activity-icon-badge">${iconHtml}</div>
            <div class="activity-details">
                <div class="activity-text"><strong>${log.admin_username}</strong>: ${log.details}</div>
                <div class="activity-time">${formatDate(log.timestamp)}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

function drilldownDashboard(cohort, status) {
    // Reset filters
    clearAllFineFilters();
    
    // Set filters based on card clicked
    document.getElementById('fineCohortFilter').value = cohort;
    
    // Switch tab/status
    if (status) {
        switchFineTab(status);
    } else {
        switchFineTab('OPEN');
    }
    
    switchView('fines');
}

// ==========================================
// 6. STUDENT MASTER MODULE
// ==========================================

let studentTab = 'active'; // active / history
let studentSearch = '';
let studentCohortFilter = '';
let studentSortField = 'name';
let studentSortAsc = true;
let studentPage = 1;
let studentPageSize = 25;

function switchStudentTab(tab) {
    studentTab = tab;
    document.getElementById('studentTabActive').classList.toggle('active', tab === 'active');
    document.getElementById('studentTabHistory').classList.toggle('active', tab === 'history');
    
    studentPage = 1;
    loadStudentList();
}

function getStudentPlacementStatus(studentId) {
    const student = db.students.find(s => s.id === studentId);
    if (!student) return { status: 'UNKNOWN', label: 'Unknown', className: 'badge-secondary', openCount: 0, totalFlags: 0 };
    
    // Find all active (non-deleted) fines for this student
    const studentFines = db.fines.filter(f => !f.is_deleted && f.student_id === studentId);
    
    // Check if they have any open fines
    const openFines = studentFines.filter(f => f.status === 'OPEN');
    
    // Calculate cumulative red flags (sum of red flags from OPEN fines)
    const cumulativeFlags = openFines.reduce((sum, f) => sum + (f.red_flags || 0), 0);
    
    const isSuspended = openFines.length > 0 || cumulativeFlags >= 3;
    
    return {
        status: isSuspended ? 'SUSPENDED' : 'ELIGIBLE',
        label: isSuspended ? 'Suspended' : 'Eligible',
        className: isSuspended ? 'badge-danger' : 'badge-success',
        openCount: openFines.length,
        totalFlags: cumulativeFlags
    };
}

function loadStudentList() {
    studentSearch = document.getElementById('studentSearchInput').value.trim().toLowerCase();
    studentCohortFilter = document.getElementById('studentCohortFilter').value;
    
    // 1. Filter students
    let filtered = db.students.filter(student => {
        // Tab Soft delete logic
        if (studentTab === 'active' && student.is_deleted) return false;
        if (studentTab === 'history' && !student.is_deleted) return false;
        
        // Search filter (Fuzzy search name/roll number)
        if (studentSearch) {
            const matchesName = student.name.toLowerCase().includes(studentSearch);
            const matchesRoll = student.roll_number.toLowerCase().includes(studentSearch);
            if (!matchesName && !matchesRoll) return false;
        }
        
        // Cohort filter
        if (studentCohortFilter && student.cohort !== studentCohortFilter) return false;
        
        return true;
    });

    // 2. Tab Badge update
    const totalActive = db.students.filter(s => !s.is_deleted).length;
    const totalDeleted = db.students.filter(s => s.is_deleted).length;
    document.getElementById('studentBadgeActive').innerText = totalActive;
    document.getElementById('studentBadgeHistory').innerText = totalDeleted;

    filtered.sort((a, b) => {
        let valA = (a[studentSortField] !== null && a[studentSortField] !== undefined) ? a[studentSortField].toString().toLowerCase() : '';
        let valB = (b[studentSortField] !== null && b[studentSortField] !== undefined) ? b[studentSortField].toString().toLowerCase() : '';
        
        if (valA < valB) return studentSortAsc ? -1 : 1;
        if (valA > valB) return studentSortAsc ? 1 : -1;
        return 0;
    });

    // 4. Update Sort Icon UI
    document.querySelectorAll('#studentTable th span.sort-icon').forEach(el => el.innerHTML = '&#8645;');
    const currentSortIcon = document.getElementById(`studentSort_${studentSortField}`);
    if (currentSortIcon) {
        currentSortIcon.innerHTML = studentSortAsc ? '&#8593;' : '&#8595;';
    }

    // 5. Pagination calculation
    const totalRecords = filtered.length;
    const maxPage = Math.max(1, Math.ceil(totalRecords / studentPageSize));
    if (studentPage > maxPage) studentPage = maxPage;
    
    const startIndex = (studentPage - 1) * studentPageSize;
    const endIndex = Math.min(startIndex + studentPageSize, totalRecords);
    const paginatedData = filtered.slice(startIndex, endIndex);

    // Update paging UI
    document.getElementById('studentPaginationInfo').innerText = totalRecords > 0 
        ? `Showing ${startIndex + 1}-${endIndex} of ${totalRecords} students` 
        : `Showing 0-0 of 0 students`;
    document.getElementById('studentPagePrev').disabled = (studentPage === 1);
    document.getElementById('studentPageNext').disabled = (studentPage === maxPage);

    // 6. Draw Table
    const tbody = document.getElementById('studentTableBody');
    tbody.innerHTML = '';
    
    if (paginatedData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-secondary); padding: 30px;">No student records found matching filters.</td></tr>`;
        return;
    }

    paginatedData.forEach(student => {
        const tr = document.createElement('tr');
        
        let actionButtons = '';
        if (studentTab === 'active') {
            actionButtons = `
                <div style="display: flex; gap: 6px; align-items: center; white-space: nowrap;">
                    <button class="btn btn-outline btn-sm" onclick="openEditStudentModal('${student.id}')" title="Edit Profile" style="color: #4f46e5; border-color: rgba(79,70,229,0.15); display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; background: #e0e7ff; transition: all 0.2s;" onmouseover="this.style.background='#c7d2fe'" onmouseout="this.style.background='#e0e7ff'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn btn-outline btn-sm" style="color: var(--color-danger); border-color: rgba(239,68,68,0.15); display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; background: #fef2f2; transition: all 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'" onclick="softDeleteStudent('${student.id}')" title="Soft Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                    <button class="btn btn-sm" style="display: inline-flex; align-items: center; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; padding: 6px 12px; font-weight: 500; cursor: pointer; border-radius: var(--radius-sm); transition: all 0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'" onclick="drilldownToStudentFines('${student.id}')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px; vertical-align: middle;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>View Fines
                    </button>
                </div>
            `;
        } else {
            actionButtons = `
                <div style="display: flex; gap: 6px; align-items: center; white-space: nowrap;">
                    <button class="btn btn-outline btn-sm" style="color: var(--color-success); border-color: rgba(16,185,129,0.15); display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: #ecfdf5; transition: all 0.2s;" onmouseover="this.style.background='#d1fae5'" onmouseout="this.style.background='#ecfdf5'" onclick="restoreStudent('${student.id}')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg>Restore
                    </button>
                    <button class="btn btn-sm" style="display: inline-flex; align-items: center; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; padding: 6px 12px; font-weight: 500; cursor: pointer; border-radius: var(--radius-sm); transition: all 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'" onclick="permanentPurgeStudent('${student.id}')" title="Permanently Purge">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px; vertical-align: middle;"><path d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16"/></svg>Purge
                    </button>
                </div>
            `;
        }
        
        const statusInfo = getStudentPlacementStatus(student.id);

        tr.innerHTML = `
            <td style="font-weight: 600;">${student.name}</td>
            <td style="font-family: monospace; font-size: 13px;">${student.roll_number}</td>
            <td>${student.email_id}</td>
            <td><span class="badge ${student.cohort === 'SUMMER_2026_27' ? 'badge-open' : 'badge-carried'}">${getCohortDisplayLabel(student.cohort)}</span></td>
            <td>
                <span class="badge ${statusInfo.className}" style="font-weight: 600; cursor: help;" title="${statusInfo.openCount} Open Fine(s), ${statusInfo.totalFlags} Cumulative Red Flag(s)">
                    ${statusInfo.label} (${statusInfo.totalFlags} Flags)
                </span>
            </td>
            <td class="actions-cell">${actionButtons}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Student Autocomplete and Suggestion listener
safeAddListener('studentSearchInput', 'input', function(e) {
    const query = e.target.value.trim().toLowerCase();
    const suggestionsBox = document.getElementById('studentSuggestions');
    suggestionsBox.innerHTML = '';
    
    if (query.length < 2) {
        suggestionsBox.style.display = 'none';
        loadStudentList();
        return;
    }
    
    const matches = db.students.filter(s => {
        if (studentTab === 'active' && s.is_deleted) return false;
        if (studentTab === 'history' && !s.is_deleted) return false;
        return s.name.toLowerCase().includes(query) || s.roll_number.toLowerCase().includes(query);
    }).slice(0, 5);
    
    if (matches.length > 0) {
        suggestionsBox.style.display = 'block';
        matches.forEach(student => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<span>${student.name}</span><span class="roll">${student.roll_number}</span>`;
            div.addEventListener('click', function() {
                document.getElementById('studentSearchInput').value = student.name;
                suggestionsBox.style.display = 'none';
                loadStudentList();
            });
            suggestionsBox.appendChild(div);
        });
    } else {
        suggestionsBox.style.display = 'none';
        loadStudentList();
    }
});

// Close suggestions on outside click
document.addEventListener('click', function(e) {
    if (!e.target.closest('#studentSearchInput') && !e.target.closest('#studentSuggestions')) {
        document.getElementById('studentSuggestions').style.display = 'none';
    }
    if (!e.target.closest('#fineSearchInput') && !e.target.closest('#fineSearchSuggestions')) {
        document.getElementById('fineSearchSuggestions').style.display = 'none';
    }
    if (!e.target.closest('#fineStudentSearch') && !e.target.closest('#fineStudentSuggestions')) {
        document.getElementById('fineStudentSuggestions').style.display = 'none';
    }
    if (!e.target.closest('.multi-select-container')) {
        document.querySelectorAll('.multi-select-dropdown').forEach(el => el.style.display = 'none');
    }
});

safeAddListener('studentCohortFilter', 'change', function() {
    studentPage = 1;
    loadStudentList();
});

function sortStudents(field) {
    if (studentSortField === field) {
        studentSortAsc = !studentSortAsc;
    } else {
        studentSortField = field;
        studentSortAsc = true;
    }
    loadStudentList();
}

function changeStudentPageSize() {
    studentPageSize = parseInt(document.getElementById('studentPageSize').value);
    studentPage = 1;
    loadStudentList();
}

function navigateStudentPage(direction) {
    studentPage += direction;
    loadStudentList();
}

// Student form actions (Manual Add/Edit)
function openAddStudentModal() {
    document.getElementById('studentForm').reset();
    document.getElementById('studentModalTitle').innerText = 'Add New Student';
    document.getElementById('studentModalMode').value = 'ADD';
    document.getElementById('studentRoll').disabled = false;
    document.getElementById('studentCohort').disabled = false;
    
    // Clear inline error notifications
    document.getElementById('studentRollError').style.display = 'none';
    document.getElementById('studentEmailError').style.display = 'none';
    document.getElementById('studentCohortError').style.display = 'none';
    
    openModal('studentModal');
}

function openEditStudentModal(id) {
    const student = db.students.find(s => s.id === id);
    if (!student) return;
    
    document.getElementById('studentModalTitle').innerText = 'Edit Student Details';
    document.getElementById('studentModalMode').value = 'EDIT';
    document.getElementById('studentModalId').value = student.id;
    document.getElementById('studentName').value = student.name;
    document.getElementById('studentEmail').value = student.email_id;
    
    // Roll Number and Cohort are LOCKED after student creation
    document.getElementById('studentRoll').value = student.roll_number;
    document.getElementById('studentRoll').disabled = true;
    
    document.getElementById('studentCohort').value = student.cohort;
    document.getElementById('studentCohort').disabled = true;
    
    // Clear inline errors
    document.getElementById('studentRollError').style.display = 'none';
    document.getElementById('studentEmailError').style.display = 'none';
    document.getElementById('studentCohortError').style.display = 'none';
    
    openModal('studentModal');
}

safeAddListener('studentForm', 'submit', function(e) {
    e.preventDefault();
    
    const mode = document.getElementById('studentModalMode').value;
    const id = document.getElementById('studentModalId').value;
    const name = document.getElementById('studentName').value.trim();
    const roll = document.getElementById('studentRoll').value.trim().toUpperCase();
    const email = document.getElementById('studentEmail').value.trim();
    const cohort = document.getElementById('studentCohort').value;
    
    const rollErr = document.getElementById('studentRollError');
    const emailErr = document.getElementById('studentEmailError');
    
    rollErr.style.display = 'none';
    emailErr.style.display = 'none';
    
    // Validate email format
    if (!validateEmail(email)) {
        emailErr.innerText = 'Invalid email ID format. Must contain @ and a domain.';
        emailErr.style.display = 'block';
        return;
    }
    
    if (mode === 'ADD') {
        // Roll number uniqueness database validations:
        // 1. Same roll number cannot exist in both cohorts
        const rollMatchGlobal = db.students.find(s => s.roll_number === roll && !s.is_deleted);
        if (rollMatchGlobal) {
            rollErr.innerText = rollMatchGlobal.cohort === cohort 
                ? 'Roll number already exists in this cohort.' 
                : 'Roll number exists in the other cohort. A student cannot belong to both cohorts.';
            rollErr.style.display = 'block';
            return;
        }
        
        const newStudent = {
            id: generateUUID(),
            name,
            roll_number: roll,
            email_id: email,
            cohort,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_deleted: false,
            deleted_at: null
        };
        
        db.students.push(newStudent);
        saveTable(DB_KEYS.STUDENTS, db.students);
        pushToCloud('students', newStudent);
        
        logAdminAction('STUDENT_CREATED', 'STUDENT', newStudent.id, `Created student ${name} (${roll}) in ${cohort} cohort.`);
        showToast(`Student ${name} successfully added!`, 'success');
        
    } else if (mode === 'EDIT') {
        const student = db.students.find(s => s.id === id);
        if (!student) return;
        
        const oldName = student.name;
        const oldEmail = student.email_id;
        
        student.name = name;
        student.email_id = email;
        student.updated_at = new Date().toISOString();
        
        saveTable(DB_KEYS.STUDENTS, db.students);
        pushToCloud('students', student);
        
        logAdminAction('STUDENT_EDITED', 'STUDENT', student.id, `Edited student ${oldName} (${student.roll_number}). Changes: Name: "${oldName}" &rarr; "${name}", Email: "${oldEmail}" &rarr; "${email}".`);
        showToast('Student changes saved successfully', 'success');
    }
    
    closeModal('studentModal');
    loadStudentList();
});

function softDeleteStudent(id) {
    const student = db.students.find(s => s.id === id);
    if (!student) return;
    
    if (confirm(`Are you sure you want to move student "${student.name}" and all their associated fines to the History/Soft-deleted archive?\n\nRecords will remain recoverable for 30 days before automatic purge.`)) {
        student.is_deleted = true;
        student.deleted_at = new Date().toISOString();
        
        // Cascading soft-delete on all student's fines
        db.fines.forEach(fine => {
            if (fine.student_id === student.id && !fine.is_deleted) {
                fine.is_deleted = true;
                fine.deleted_at = new Date().toISOString();
                logFineEdit(fine.id, 'is_deleted', 'false', 'true', 'DELETED', 'Cascaded soft-delete on student removal');
            }
        });
        
        saveTable(DB_KEYS.STUDENTS, db.students);
        saveTable(DB_KEYS.FINES, db.fines);
        
        pushToCloud('students', student);
        db.fines.forEach(fine => {
            if (fine.student_id === student.id) {
                pushToCloud('fines', fine);
            }
        });
        
        logAdminAction('STUDENT_DELETED', 'STUDENT', student.id, `Soft-deleted student ${student.name} and cascaded deletion of open fines.`);
        showToast('Student moved to history tab successfully.', 'warning');
        
        loadStudentList();
    }
}

function restoreStudent(id) {
    const student = db.students.find(s => s.id === id);
    if (!student) return;
    
    student.is_deleted = false;
    student.deleted_at = null;
    student.updated_at = new Date().toISOString();
    
    // Note: Fines are NOT automatically restored, they must be restored manually in Fines registry tab if desired, or we can restore them
    db.fines.forEach(fine => {
        if (fine.student_id === student.id && fine.is_deleted) {
            // Check if the fine was deleted exactly at the same time (approx)
            fine.is_deleted = false;
            fine.deleted_at = null;
            logFineEdit(fine.id, 'is_deleted', 'true', 'false', 'EDITED', 'Restored automatically via Student restoration');
        }
    });

    saveTable(DB_KEYS.STUDENTS, db.students);
    saveTable(DB_KEYS.FINES, db.fines);
    
    pushToCloud('students', student);
    db.fines.forEach(fine => {
        if (fine.student_id === student.id) {
            pushToCloud('fines', fine);
        }
    });
    
    logAdminAction('STUDENT_RESTORED', 'STUDENT', student.id, `Restored student ${student.name} from trash bin.`);
    showToast(`Student ${student.name} has been restored.`, 'success');
    
    loadStudentList();
}

function permanentPurgeStudent(id) {
    const student = db.students.find(s => s.id === id);
    if (!student) return;
    
    if (confirm(`WARNING: Permanent purge cannot be undone. Are you sure you want to permanently delete student "${student.name}" and all their associated fines right now?`)) {
        // Remove student
        db.students = db.students.filter(s => s.id !== id);
        // Cascade remove fines
        db.fines = db.fines.filter(f => f.student_id !== id);
        
        saveTable(DB_KEYS.STUDENTS, db.students);
        saveTable(DB_KEYS.FINES, db.fines);
        
        if (supabaseClient) {
            supabaseClient.from('students').delete().eq('id', id).then();
            supabaseClient.from('fines').delete().eq('student_id', id).then();
        }
        
        logAdminAction('STUDENT_PURGED', 'STUDENT', id, `Permanently purged student ${student.name} from system database.`);
        showToast('Student record purged permanently.', 'danger');
        
        loadStudentList();
    }
}

function drilldownToStudentFines(studentId) {
    const student = db.students.find(s => s.id === studentId);
    if (!student) return;
    
    // Filter fines list
    clearAllFineFilters();
    document.getElementById('fineSearchInput').value = student.name;
    loadFineList();
    switchView('fines');
}

// ==========================================
// 7. FINE REGISTRY MODULE
// ==========================================

let fineTab = 'OPEN'; // OPEN / CLOSED / CARRIED_FORWARD / DELETED
let fineSearch = '';
let fineCohortFilter = '';
let fineCategoryFilter = []; // array for multi-select
let fineRedFlagFilter = ''; // cumulative count >= value
let fineMultipleCategories = false;
let fineSortField = 'studentName';
let fineSortAsc = true;
let finePage = 1;
let finePageSize = 25;
let selectedFinesForBulk = new Set();

function switchFineTab(tab) {
    fineTab = tab;
    
    // Toggle tab styles
    document.getElementById('fineTabActive').classList.toggle('active', tab === 'OPEN');
    document.getElementById('fineTabClosed').classList.toggle('active', tab === 'CLOSED');
    document.getElementById('fineTabCarried').classList.toggle('active', tab === 'CARRIED_FORWARD');
    document.getElementById('fineTabHistory').classList.toggle('active', tab === 'DELETED');
    
    // Checkbox column header and toggle behavior only in Active (OPEN) or status groups
    const chkColHeader = document.getElementById('thFineCheckboxHeader');
    if (tab === 'DELETED') {
        chkColHeader.style.opacity = '0.3';
        document.getElementById('selectAllFinesCheckbox').disabled = true;
    } else {
        chkColHeader.style.opacity = '1';
        document.getElementById('selectAllFinesCheckbox').disabled = false;
    }
    
    // Reset bulk selections
    selectedFinesForBulk.clear();
    document.getElementById('selectAllFinesCheckbox').checked = false;
    updateBulkActionBar();
    
    finePage = 1;
    loadFineList();
}

function toggleMultiSelect(id) {
    const el = document.getElementById(id);
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

function populateViolationCategoryFilters() {
    const dropdown = document.getElementById('categoryMultiSelectDropdown');
    dropdown.innerHTML = '';
    
    // Unique violation categories
    const categories = Array.from(new Set(db.violations.map(v => v.parent_category)));
    
    categories.forEach(cat => {
        const label = document.createElement('label');
        label.className = 'multi-select-option';
        label.innerHTML = `
            <input type="checkbox" value="${cat}" onchange="handleCategoryFilterChange()">
            <span>${cat}</span>
        `;
        dropdown.appendChild(label);
    });
}

function handleCategoryFilterChange() {
    const selected = [];
    document.querySelectorAll('#categoryMultiSelectDropdown input:checked').forEach(chk => {
        selected.push(chk.value);
    });
    
    fineCategoryFilter = selected;
    
    // Update trigger label
    const label = document.getElementById('categoryMultiSelectLabel');
    if (selected.length === 0) {
        label.innerText = 'All Categories';
    } else if (selected.length === 1) {
        label.innerText = selected[0].substring(0, 15) + '...';
    } else {
        label.innerText = `${selected.length} Selected`;
    }
    
    finePage = 1;
    loadFineList();
}

function clearAllFineFilters() {
    document.getElementById('fineSearchInput').value = '';
    document.getElementById('fineCohortFilter').value = '';
    document.getElementById('fineRedFlagFilter').value = '';
    document.getElementById('fineMultipleCategoriesCheckbox').checked = false;
    
    // Uncheck categories
    document.querySelectorAll('#categoryMultiSelectDropdown input:checked').forEach(chk => {
        chk.checked = false;
    });
    fineCategoryFilter = [];
    document.getElementById('categoryMultiSelectLabel').innerText = 'All Categories';
    
    fineSearch = '';
    fineCohortFilter = '';
    fineRedFlagFilter = '';
    fineMultipleCategories = false;
    
    finePage = 1;
    loadFineList();
}

function loadFineList() {
    fineSearch = document.getElementById('fineSearchInput').value.trim().toLowerCase();
    fineCohortFilter = document.getElementById('fineCohortFilter').value;
    fineRedFlagFilter = document.getElementById('fineRedFlagFilter').value;
    fineMultipleCategories = document.getElementById('fineMultipleCategoriesCheckbox').checked;

    // 1. Gather all student flags per cohort to calculate cumulative red flags in real-time
    const studentCumulativeFlags = {}; // key: student_id, val: flags
    const studentFinesCount = {}; // key: student_id, val: set of categories
    
    db.fines.forEach(f => {
        if (!f.is_deleted) {
            studentCumulativeFlags[f.student_id] = (studentCumulativeFlags[f.student_id] || 0) + (f.red_flags || 0);
        }
        
        if (!f.is_deleted) {
            if (!studentFinesCount[f.student_id]) studentFinesCount[f.student_id] = new Set();
            const cat = db.violations.find(v => v.id === f.violation_category_id);
            if (cat) studentFinesCount[f.student_id].add(cat.parent_category);
        }
    });

    // 2. Filter fines
    let filtered = db.fines.map(fine => {
        // Resolve student details and category details
        const student = db.students.find(s => s.id === fine.student_id);
        const category = db.violations.find(v => v.id === fine.violation_category_id);
        const cumFlags = student ? (studentCumulativeFlags[student.id] || 0) : 0;
        
        return {
            ...fine,
            studentName: student ? student.name : 'Unknown Student',
            rollNumber: student ? student.roll_number : 'N/A',
            categoryName: category ? category.category_name : 'Unknown Category',
            parentCategory: category ? category.parent_category : 'Unknown Parent',
            cumulativeFlags: cumFlags,
            categoryCount: student ? (studentFinesCount[student.id]?.size || 0) : 0
        };
    }).filter(fine => {
        // Tab mapping
        if (fineTab === 'DELETED') {
            if (!fine.is_deleted) return false;
        } else {
            if (fine.is_deleted) return false;
            if (fineTab === 'OPEN') {
                if (fine.status !== 'OPEN' && fine.status !== 'PROOF_SUBMITTED') return false;
            } else {
                if (fine.status !== fineTab) return false;
            }
        }
        
        // Search filter (name/roll)
        if (fineSearch) {
            const matchesName = fine.studentName.toLowerCase().includes(fineSearch);
            const matchesRoll = fine.rollNumber.toLowerCase().includes(fineSearch);
            if (!matchesName && !matchesRoll) return false;
        }
        
        // Cohort filter
        if (fineCohortFilter && fine.cohort !== fineCohortFilter) return false;
        
        // Multi-select Category filter
        if (fineCategoryFilter.length > 0 && !fineCategoryFilter.includes(fine.parentCategory)) return false;
        
        // Red flag filter
        if (fineRedFlagFilter) {
            const targetMin = parseInt(fineRedFlagFilter);
            if (fine.cumulativeFlags < targetMin) return false;
        }
        
        // Advanced: Multiple categories checkbox
        if (fineMultipleCategories && fine.categoryCount < 2) return false;
        
        return true;
    });

    // 3. Tab Badge updates
    const totalOpen = db.fines.filter(f => !f.is_deleted && (f.status === 'OPEN' || f.status === 'PROOF_SUBMITTED')).length;
    const totalClosed = db.fines.filter(f => !f.is_deleted && f.status === 'CLOSED').length;
    const totalCarried = db.fines.filter(f => !f.is_deleted && f.status === 'CARRIED_FORWARD').length;
    const totalDeleted = db.fines.filter(f => f.is_deleted).length;
    
    document.getElementById('fineBadgeActive').innerText = totalOpen;
    document.getElementById('fineBadgeClosed').innerText = totalClosed;
    document.getElementById('fineBadgeCarried').innerText = totalCarried;
    document.getElementById('fineBadgeHistory').innerText = totalDeleted;

    // 4. Active filters indicator
    let filterCount = 0;
    if (fineSearch) filterCount++;
    if (fineCohortFilter) filterCount++;
    if (fineCategoryFilter.length > 0) filterCount++;
    if (fineRedFlagFilter) filterCount++;
    if (fineMultipleCategories) filterCount++;
    
    const filterIndicator = document.getElementById('activeFilterCount');
    if (filterCount > 0) {
        filterIndicator.innerText = `${filterCount} filter${filterCount > 1 ? 's' : ''} active`;
        filterIndicator.style.display = 'inline-block';
    } else {
        filterIndicator.style.display = 'none';
    }

    // 5. Sort Fines
    filtered.sort((a, b) => {
        let valA, valB;
        
        if (fineSortField === 'studentName' || fineSortField === 'rollNumber') {
            valA = a[fineSortField].toLowerCase();
            valB = b[fineSortField].toLowerCase();
        } else if (fineSortField === 'category') {
            valA = a.categoryName.toLowerCase();
            valB = b.categoryName.toLowerCase();
        } else if (fineSortField === 'penalty') {
            valA = a.monetary_penalty_amount || 0;
            valB = b.monetary_penalty_amount || 0;
        } else {
            valA = a[fineSortField] || '';
            valB = b[fineSortField] || '';
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
        }
        
        if (valA < valB) return fineSortAsc ? -1 : 1;
        if (valA > valB) return fineSortAsc ? 1 : -1;
        return 0;
    });

    // 6. Update Sort Icons UI
    document.querySelectorAll('#fineTable th span.sort-icon').forEach(el => el.innerHTML = '&#8645;');
    const currentSortIcon = document.getElementById(`fineSort_${fineSortField}`);
    if (currentSortIcon) {
        currentSortIcon.innerHTML = fineSortAsc ? '&#8593;' : '&#8595;';
    }

    // 7. Pagination
    const totalRecords = filtered.length;
    const maxPage = Math.max(1, Math.ceil(totalRecords / finePageSize));
    if (finePage > maxPage) finePage = maxPage;
    
    const startIndex = (finePage - 1) * finePageSize;
    const endIndex = Math.min(startIndex + finePageSize, totalRecords);
    const paginatedData = filtered.slice(startIndex, endIndex);

    document.getElementById('finePaginationInfo').innerText = totalRecords > 0 
        ? `Showing ${startIndex + 1}-${endIndex} of ${totalRecords} fines` 
        : `Showing 0-0 of 0 fines`;
    document.getElementById('finePagePrev').disabled = (finePage === 1);
    document.getElementById('finePageNext').disabled = (finePage === maxPage);

    // 8. Draw Table
    const tbody = document.getElementById('fineTableBody');
    tbody.innerHTML = '';
    
    if (paginatedData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--color-text-secondary); padding: 30px;">No fines registered matching filters.</td></tr>`;
        return;
    }

    paginatedData.forEach(fine => {
        const tr = document.createElement('tr');
        
        let actions = '';
        if (fineTab === 'DELETED') {
            actions = `
                <div style="display: flex; gap: 6px; align-items: center;">
                    <button class="btn btn-outline btn-sm" style="color: var(--color-success); border-color: rgba(16,185,129,0.2); display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px;" onclick="restoreFine('${fine.id}')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: middle;"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg>Restore
                    </button>
                </div>
            `;
        } else {
            actions = `
                <div style="display: flex; gap: 6px; align-items: center;">
                    <button class="btn btn-outline btn-sm" onclick="openFineDetailsModal('${fine.id}')" title="View Details/Audit" style="color: var(--color-primary); border-color: rgba(59,130,246,0.15); display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; background: #eff6ff; transition: all 0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="openEditFineModal('${fine.id}')" title="Edit Record" style="color: #4f46e5; border-color: rgba(79,70,229,0.15); display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; background: #e0e7ff; transition: all 0.2s;" onmouseover="this.style.background='#c7d2fe'" onmouseout="this.style.background='#e0e7ff'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="openIndividualStatusModal('${fine.id}')" title="Update Status" style="color: #10b981; border-color: rgba(16,185,129,0.15); display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; background: #ecfdf5; transition: all 0.2s;" onmouseover="this.style.background='#d1fae5'" onmouseout="this.style.background='#ecfdf5'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                    </button>
                    <button class="btn btn-outline btn-sm" style="color: var(--color-danger); border-color: rgba(239,68,68,0.15); display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; background: #fef2f2; transition: all 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'" onclick="softDeleteFine('${fine.id}')" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            `;
        }

        const isChecked = selectedFinesForBulk.has(fine.id) ? 'checked' : '';
        const chkDisabled = fineTab === 'DELETED' ? 'disabled' : '';

        // Status badge formatting
        let statusBadge = '';
        if (fine.status === 'OPEN') statusBadge = '<span class="badge badge-open">Open</span>';
        else if (fine.status === 'CLOSED') statusBadge = '<span class="badge badge-closed">Closed</span>';
        else if (fine.status === 'CARRIED_FORWARD') statusBadge = '<span class="badge badge-carried">Carried Forward</span>';
        else if (fine.status === 'PROOF_SUBMITTED') statusBadge = '<span class="badge badge-proof">Proof Submitted</span>';

        const statusInfo = getStudentPlacementStatus(fine.student_id);

        tr.innerHTML = `
            <td class="checkbox-cell">
                <input type="checkbox" class="table-checkbox fine-row-checkbox" value="${fine.id}" ${isChecked} ${chkDisabled} onchange="handleFineRowCheckboxChange(this)">
            </td>
            <td style="font-weight: 600;">${fine.studentName}</td>
            <td style="font-family: monospace; font-size: 13px;">${fine.rollNumber}</td>
            <td><span class="badge ${fine.cohort === 'SUMMER_2026_27' ? 'badge-open' : 'badge-carried'}">${getCohortDisplayLabel(fine.cohort)}</span></td>
            <td style="font-family: monospace; font-size: 13px; font-weight: 600;">${fine.session || 'N/A'}</td>
            <td style="font-size: 13px;" title="${fine.categoryName}">${fine.categoryName.length > 30 ? fine.categoryName.substring(0, 27) + '...' : fine.categoryName}</td>
            <td style="font-weight: 600;">${fine.monetary_penalty_amount !== null ? formatINR(fine.monetary_penalty_amount) : '₹0'}</td>
            <td style="text-align: center;"><span class="red-flags-count-badge ${fine.red_flags === 0 ? 'zero' : ''}">${fine.red_flags}</span></td>
            <td>${statusBadge}</td>
            <td>
                <span class="badge ${statusInfo.className}" style="font-weight: 600; cursor: help;" title="${statusInfo.openCount} Open Fine(s), ${statusInfo.totalFlags} Cumulative Red Flag(s)">
                    ${statusInfo.label} (${statusInfo.totalFlags} Flags)
                </span>
            </td>
            <td class="actions-cell">${actions}</td>
        `;
        tbody.appendChild(tr);
    });
}

function sortFines(field) {
    if (fineSortField === field) {
        fineSortAsc = !fineSortAsc;
    } else {
        fineSortField = field;
        fineSortAsc = true;
    }
    loadFineList();
}

function changeFinePageSize() {
    finePageSize = parseInt(document.getElementById('finePageSize').value);
    finePage = 1;
    loadFineList();
}

function navigateFinePage(direction) {
    finePage += direction;
    loadFineList();
}

// Bulk selections actions
function toggleSelectAllFines() {
    const masterChk = document.getElementById('selectAllFinesCheckbox');
    const checkboxes = document.querySelectorAll('.fine-row-checkbox:not(:disabled)');
    
    checkboxes.forEach(chk => {
        chk.checked = masterChk.checked;
        if (masterChk.checked) {
            selectedFinesForBulk.add(chk.value);
        } else {
            selectedFinesForBulk.delete(chk.value);
        }
    });
    
    updateBulkActionBar();
}

function handleFineRowCheckboxChange(chk) {
    if (chk.checked) {
        selectedFinesForBulk.add(chk.value);
    } else {
        selectedFinesForBulk.delete(chk.value);
    }
    
    // Update master checkbox check state
    const allCount = document.querySelectorAll('.fine-row-checkbox:not(:disabled)').length;
    const checkedCount = document.querySelectorAll('.fine-row-checkbox:not(:disabled):checked').length;
    document.getElementById('selectAllFinesCheckbox').checked = (allCount === checkedCount && allCount > 0);
    
    updateBulkActionBar();
}

function updateBulkActionBar() {
    const bar = document.getElementById('bulkActionBar');
    const countDisplay = document.getElementById('bulkSelectedCount');
    
    if (selectedFinesForBulk.size > 0 && fineTab !== 'DELETED') {
        countDisplay.innerText = selectedFinesForBulk.size;
        bar.classList.add('show');
    } else {
        bar.classList.remove('show');
    }
}

// Auto suggest student search for fine registration
safeAddListener('fineStudentSearch', 'input', function(e) {
    const query = e.target.value.trim().toLowerCase();
    const suggestionsBox = document.getElementById('fineStudentSuggestions');
    suggestionsBox.innerHTML = '';
    
    if (query.length < 2) {
        suggestionsBox.style.display = 'none';
        return;
    }
    
    const matches = db.students.filter(s => !s.is_deleted && (s.name.toLowerCase().includes(query) || s.roll_number.toLowerCase().includes(query))).slice(0, 5);
    
    if (matches.length > 0) {
        suggestionsBox.style.display = 'block';
        matches.forEach(student => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<span>${student.name}</span><span class="roll">${student.roll_number} (${student.cohort})</span>`;
            div.addEventListener('click', function() {
                document.getElementById('fineStudentSearch').value = `${student.name} (${student.roll_number})`;
                document.getElementById('fineStudentId').value = student.id;
                document.getElementById('fineCohortDisplay').value = student.cohort;
                suggestionsBox.style.display = 'none';
                
                // Repopulate violation categories based on selected student's cohort boundary
                populateViolationCategorySelects(student.cohort);
            });
            suggestionsBox.appendChild(div);
        });
    } else {
        suggestionsBox.style.display = 'none';
    }
});

// Fine autocomplete search inside multi-filter toolbar
safeAddListener('fineSearchInput', 'input', function(e) {
    const query = e.target.value.trim().toLowerCase();
    const suggestionsBox = document.getElementById('fineSearchSuggestions');
    suggestionsBox.innerHTML = '';
    
    if (query.length < 2) {
        suggestionsBox.style.display = 'none';
        loadFineList();
        return;
    }
    
    // Unique list of student names or roll numbers registered in active fines
    const uniqueMatches = [];
    const seen = new Set();
    
    db.fines.forEach(f => {
        if (f.is_deleted) return;
        const stud = db.students.find(s => s.id === f.student_id);
        if (stud && !seen.has(stud.id)) {
            if (stud.name.toLowerCase().includes(query) || stud.roll_number.toLowerCase().includes(query)) {
                seen.add(stud.id);
                uniqueMatches.push(stud);
            }
        }
    });

    if (uniqueMatches.length > 0) {
        suggestionsBox.style.display = 'block';
        uniqueMatches.slice(0, 5).forEach(student => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<span>${student.name}</span><span class="roll">${student.roll_number}</span>`;
            div.addEventListener('click', function() {
                document.getElementById('fineSearchInput').value = student.name;
                suggestionsBox.style.display = 'none';
                loadFineList();
            });
            suggestionsBox.appendChild(div);
        });
    } else {
        suggestionsBox.style.display = 'none';
        loadFineList();
    }
});

safeAddListener('fineCohortFilter', 'change', function() {
    finePage = 1;
    loadFineList();
});

safeAddListener('fineRedFlagFilter', 'change', function() {
    finePage = 1;
    loadFineList();
});

safeAddListener('fineMultipleCategoriesCheckbox', 'change', function() {
    finePage = 1;
    loadFineList();
});

function populateViolationCategorySelects(studentCohort = null) {
    const select = document.getElementById('fineViolationSelect');
    select.innerHTML = '<option value="" disabled selected>Select Violation Category</option>';
    
    // Group violations by parent category
    const grouped = {};
    db.violations.forEach(v => {
        if (studentCohort && v.cohort !== studentCohort) return;
        
        if (!grouped[v.parent_category]) grouped[v.parent_category] = [];
        grouped[v.parent_category].push(v);
    });

    for (const [parentCat, list] of Object.entries(grouped)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = parentCat;
        
        list.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            
            let penaltyLabel = '';
            if (v.combination_type === 'MONETARY_ONLY') penaltyLabel = ` (₹${v.monetary_penalty_amount})`;
            else if (v.combination_type === 'RED_FLAG_ONLY') penaltyLabel = ` (Red Flag Only)`;
            else if (v.combination_type === 'BOTH') penaltyLabel = ` (₹${v.monetary_penalty_amount} + Red Flag)`;
            
            opt.innerText = v.category_name + penaltyLabel;
            optgroup.appendChild(opt);
        });
        
        select.appendChild(optgroup);
    }

    // Add custom option group
    const optgroupCustom = document.createElement('optgroup');
    optgroupCustom.label = "Custom overrides";
    const customOpt = document.createElement('option');
    customOpt.value = "CUSTOM";
    customOpt.innerText = "-- Enter Custom Category --";
    optgroupCustom.appendChild(customOpt);
    select.appendChild(optgroupCustom);
}

function handleViolationCategoryChange() {
    const catId = document.getElementById('fineViolationSelect').value;
    const customGroup = document.getElementById('fineCustomCategoryGroup');
    const amtInput = document.getElementById('fineAmount');
    const flagSelect = document.getElementById('fineRedFlags');

    if (catId === 'CUSTOM') {
        if (customGroup) customGroup.style.display = 'block';
        amtInput.value = '';
        flagSelect.value = '0';
        document.getElementById('fineOriginalAmountTip').innerText = 'Custom Override: Enter penalty amount manually';
        document.getElementById('fineOriginalRedFlagTip').innerText = 'Custom Override: Select flags manually';
    } else {
        if (customGroup) customGroup.style.display = 'none';
        const cat = db.violations.find(v => v.id === catId);
        if (!cat) return;
        
        // Auto populate fields
        amtInput.value = cat.monetary_penalty_amount !== null ? cat.monetary_penalty_amount : 0;
        flagSelect.value = cat.red_flag_count !== null ? cat.red_flag_count : 0;
        
        // Display tooltips
        document.getElementById('fineOriginalAmountTip').innerText = cat.monetary_penalty_amount !== null 
            ? `Policy penalty: ₹${cat.monetary_penalty_amount} (overrides are tracked in audit trail)` 
            : 'Policy penalty: No monetary penalty mandated by default';
            
        document.getElementById('fineOriginalRedFlagTip').innerText = cat.red_flag_count !== null 
            ? `Policy flags: ${cat.red_flag_count} red flag(s)` 
            : 'Policy flags: No red flags mandated by default';
    }

    // Refresh differentiation tag count if in Auto-counter mode
    generateFineDiffTag();
}

function handleTagTypeChange() {
    generateFineDiffTag();
}

function generateFineDiffTag() {
    const studentId = document.getElementById('fineStudentId').value;
    const catId = document.getElementById('fineViolationSelect').value;
    const tagType = document.querySelector('input[name="tagType"]:checked').value;
    const tagInput = document.getElementById('fineDiffTag');
    
    if (!studentId || !catId) {
        tagInput.value = '';
        return;
    }
    
    if (tagType === 'timestamp') {
        const d = new Date();
        const dateStr = d.getFullYear() + '-' + 
                        (d.getMonth() + 1).toString().padStart(2, '0') + '-' + 
                        d.getDate().toString().padStart(2, '0') + ' ' + 
                        d.getHours().toString().padStart(2, '0') + ':' + 
                        d.getMinutes().toString().padStart(2, '0');
        tagInput.value = dateStr;
    } else {
        // Auto counter: count how many times this student has been fined in this category
        const matchCount = db.fines.filter(f => !f.is_deleted && f.student_id === studentId && f.violation_category_id === catId).length;
        tagInput.value = `Violation-${matchCount + 1}`;
    }
}

function openAddFineModal() {
    document.getElementById('fineForm').reset();
    document.getElementById('fineModalTitle').innerText = 'Add Placement Fine';
    document.getElementById('fineModalMode').value = 'ADD';
    
    document.getElementById('fineStudentSearch').value = '';
    document.getElementById('fineStudentSearch').disabled = false;
    document.getElementById('fineStudentId').value = '';
    document.getElementById('fineCohortDisplay').value = '';
    document.getElementById('fineSession').value = '';
    
    document.getElementById('fineOriginalAmountTip').innerText = '';
    document.getElementById('fineOriginalRedFlagTip').innerText = '';
    document.getElementById('fineNotes').value = '';
    
    const customGroup = document.getElementById('fineCustomCategoryGroup');
    if (customGroup) {
        customGroup.style.display = 'none';
        document.getElementById('fineCustomCategory').value = '';
    }

    populateViolationCategorySelects();
    openModal('fineModal');
}

function openEditFineModal(id) {
    const fine = db.fines.find(f => f.id === id);
    if (!fine) return;
    
    const student = db.students.find(s => s.id === fine.student_id);
    const category = db.violations.find(v => v.id === fine.violation_category_id);
    
    document.getElementById('fineModalTitle').innerText = 'Edit Fine Registry Details';
    document.getElementById('fineModalMode').value = 'EDIT';
    document.getElementById('fineModalId').value = fine.id;
    
    document.getElementById('fineStudentSearch').value = student ? `${student.name} (${student.roll_number})` : 'Unknown Student';
    document.getElementById('fineStudentSearch').disabled = true;
    document.getElementById('fineStudentId').value = fine.student_id;
    document.getElementById('fineCohortDisplay').value = fine.cohort;
    document.getElementById('fineSession').value = fine.session || '';
    
    // Repopulate categories locked to this student's cohort
    populateViolationCategorySelects(fine.cohort);
    
    const customGroup = document.getElementById('fineCustomCategoryGroup');
    if (category && category.parent_category === 'Custom Overrides') {
        document.getElementById('fineViolationSelect').value = 'CUSTOM';
        if (customGroup) {
            customGroup.style.display = 'block';
            document.getElementById('fineCustomCategory').value = category.category_name;
        }
    } else {
        document.getElementById('fineViolationSelect').value = fine.violation_category_id;
        if (customGroup) {
            customGroup.style.display = 'none';
            document.getElementById('fineCustomCategory').value = '';
        }
    }
    
    document.getElementById('fineAmount').value = fine.monetary_penalty_amount !== null ? fine.monetary_penalty_amount : 0;
    document.getElementById('fineRedFlags').value = fine.red_flags || 0;
    
    // Lock differentiation tags
    document.getElementById('fineDiffTag').value = fine.differentiation_tag || '';
    // Uncheck and disable tag type radios during edits
    document.querySelectorAll('input[name="tagType"]').forEach(r => r.disabled = true);
    
    document.getElementById('fineNotes').value = fine.notes_comments || '';
    
    if (category) {
        document.getElementById('fineOriginalAmountTip').innerText = `Policy Penalty: ₹${category.monetary_penalty_amount || 0}`;
        document.getElementById('fineOriginalRedFlagTip').innerText = `Policy Flags: ${category.red_flag_count || 0}`;
    }
    
    openModal('fineModal');
}

safeAddListener('fineForm', 'submit', function(e) {
    e.preventDefault();
    
    const mode = document.getElementById('fineModalMode').value;
    const fineId = document.getElementById('fineModalId').value;
    const studentId = document.getElementById('fineStudentId').value;
    const catId = document.getElementById('fineViolationSelect').value;
    const amount = parseFloat(document.getElementById('fineAmount').value);
    const redFlags = parseInt(document.getElementById('fineRedFlags').value);
    const diffTag = document.getElementById('fineDiffTag').value.trim();
    const notes = document.getElementById('fineNotes').value.trim();
    const cohort = document.getElementById('fineCohortDisplay').value;
    const session = document.getElementById('fineSession').value.trim();
    
    const student = db.students.find(s => s.id === studentId);
    
    // Validations:
    if (!session) {
        showToast('Session is a mandatory field.', 'warning');
        return;
    }
    // 1. Penalty amount must be positive
    if (isNaN(amount) || amount < 0) {
        showToast('Monetary penalty must be a positive number', 'warning');
        return;
    }
    // 2. Red flags must be 0-3
    if (redFlags < 0 || redFlags > 3) {
        showToast('Red flags must be between 0 and 3', 'warning');
        return;
    }
    // 3. At least one of Monetary Penalty or Red Flags must be specified
    if (amount === 0 && redFlags === 0) {
        showToast('At least one of Monetary Penalty or Red Flags must be specified', 'warning');
        return;
    }

    let resolvedCatId = catId;
    if (catId === 'CUSTOM') {
        const customName = document.getElementById('fineCustomCategory').value.trim();
        if (!customName) {
            showToast('Please enter a custom category name.', 'warning');
            return;
        }

        let existing = db.violations.find(v => v.cohort === cohort && v.category_name.toLowerCase() === customName.toLowerCase());
        if (!existing) {
            const newCatId = 'violation-' + generateUUID();
            existing = {
                id: newCatId,
                category_name: customName,
                parent_category: 'Custom Overrides',
                cohort: cohort,
                monetary_penalty_amount: amount,
                red_flag_count: redFlags,
                combination_type: (amount > 0 && redFlags > 0) ? 'BOTH' : (redFlags > 0 ? 'RED_FLAG_ONLY' : 'MONETARY_ONLY'),
                description: 'Manually entered custom category'
            };
            db.violations.push(existing);
            saveTable(DB_KEYS.VIOLATIONS, db.violations);
            
            if (supabaseClient) {
                pushToCloud('violations', existing);
            }
        }
        resolvedCatId = existing.id;
    }
    
    if (mode === 'ADD') {
        const newFine = {
            id: generateUUID(),
            student_id: studentId,
            violation_category_id: resolvedCatId,
            cohort: cohort,
            monetary_penalty_amount: amount,
            red_flags: redFlags,
            session: session,
            status: 'OPEN',
            differentiation_tag: diffTag,
            notes_comments: notes,
            event_id: null,
            source: 'DIRECT_MANUAL',
            created_at: new Date().toISOString(),
            closed_at: null,
            is_deleted: false,
            deleted_at: null
        };
        
        db.fines.push(newFine);
        saveTable(DB_KEYS.FINES, db.fines);
        pushToCloud('fines', newFine);
        
        logFineEdit(newFine.id, 'status', null, 'OPEN', 'CREATED', 'Manual fine registration');
        logAdminAction('FINE_CREATED', 'FINE', newFine.id, `Created fine of ₹${amount} (${redFlags} Red Flags) for student ${student ? student.name : 'Unknown'} (${cohort}).`);
        showToast('Fine registered successfully', 'success');
        
    } else if (mode === 'EDIT') {
        const fine = db.fines.find(f => f.id === fineId);
        if (!fine) return;
        
        const oldCat = fine.violation_category_id;
        const oldAmount = fine.monetary_penalty_amount;
        const oldFlags = fine.red_flags;
        const oldSession = fine.session;
        const oldNotes = fine.notes_comments;
        
        // Update values and write audit trails
        let changed = false;
        if (oldSession !== session) {
            fine.session = session;
            logFineEdit(fine.id, 'session', oldSession, session, 'EDITED', 'Placement session modified');
            changed = true;
        }
        if (oldCat !== resolvedCatId) {
            fine.violation_category_id = resolvedCatId;
            logFineEdit(fine.id, 'violation_category', oldCat, resolvedCatId, 'EDITED', 'Category modified');
            changed = true;
        }
        if (oldAmount !== amount) {
            fine.monetary_penalty_amount = amount;
            logFineEdit(fine.id, 'monetary_penalty', oldAmount, amount, 'EDITED', 'Monetary penalty overridden');
            changed = true;
        }
        if (oldFlags !== redFlags) {
            fine.red_flags = redFlags;
            logFineEdit(fine.id, 'red_flags', oldFlags, redFlags, 'EDITED', 'Red flag count overridden');
            changed = true;
        }
        if (oldNotes !== notes) {
            fine.notes_comments = notes;
            logFineEdit(fine.id, 'notes', oldNotes, notes, 'EDITED', 'Audit comment updated');
            changed = true;
        }
        
        if (changed) {
            fine.updated_at = new Date().toISOString();
            saveTable(DB_KEYS.FINES, db.fines);
            pushToCloud('fines', fine);
            logAdminAction('FINE_EDITED', 'FINE', fine.id, `Edited fine properties for student ${student ? student.name : 'Unknown'}.`);
            showToast('Fine changes saved successfully', 'success');
        }
    }
    
    // Enable radio inputs for next modal trigger
    document.querySelectorAll('input[name="tagType"]').forEach(r => r.disabled = false);
    
    closeModal('fineModal');
    loadFineList();
});

function softDeleteFine(id) {
    const fine = db.fines.find(f => f.id === id);
    if (!fine) return;
    
    if (confirm('This fine will be moved to history and remain accessible for 30 days before auto-purge. Continue?')) {
        fine.is_deleted = true;
        fine.deleted_at = new Date().toISOString();
        
        saveTable(DB_KEYS.FINES, db.fines);
        pushToCloud('fines', fine);
        
        logFineEdit(fine.id, 'is_deleted', 'false', 'true', 'DELETED', 'Soft-deleted by administrator');
        logAdminAction('FINE_DELETED', 'FINE', fine.id, `Soft-deleted fine ID ${fine.id}.`);
        showToast('Fine moved to trash history.', 'warning');
        
        loadFineList();
    }
}

function restoreFine(id) {
    const fine = db.fines.find(f => f.id === id);
    if (!fine) return;
    
    // Check if the student is soft-deleted
    const student = db.students.find(s => s.id === fine.student_id);
    if (student && student.is_deleted) {
        alert(`Cannot restore fine. The student "${student.name}" is soft-deleted. Please restore the student first.`);
        return;
    }

    fine.is_deleted = false;
    fine.deleted_at = null;
    fine.updated_at = new Date().toISOString();
    
    saveTable(DB_KEYS.FINES, db.fines);
    pushToCloud('fines', fine);
    
    logFineEdit(fine.id, 'is_deleted', 'true', 'false', 'EDITED', 'Restored from history trash bin');
    logAdminAction('FINE_RESTORED', 'FINE', fine.id, `Restored fine ID ${fine.id} to active registry.`);
    showToast('Fine restored successfully.', 'success');
    
    loadFineList();
}

// Multi-select bulk actions
function triggerBulkSoftDelete() {
    if (selectedFinesForBulk.size === 0) return;
    
    if (confirm(`Are you sure you want to soft-delete the ${selectedFinesForBulk.size} selected fines?`)) {
        selectedFinesForBulk.forEach(id => {
            const fine = db.fines.find(f => f.id === id);
            if (fine) {
                fine.is_deleted = true;
                fine.deleted_at = new Date().toISOString();
                pushToCloud('fines', fine);
                logFineEdit(fine.id, 'is_deleted', 'false', 'true', 'DELETED', 'Bulk soft-deleted by administrator');
            }
        });
        
        saveTable(DB_KEYS.FINES, db.fines);
        logAdminAction('BULK_DELETED', 'FINE', null, `Bulk soft-deleted ${selectedFinesForBulk.size} fines.`);
        showToast(`Successfully deleted ${selectedFinesForBulk.size} records.`, 'warning');
        
        selectedFinesForBulk.clear();
        document.getElementById('selectAllFinesCheckbox').checked = false;
        updateBulkActionBar();
        loadFineList();
    }
}

// Individual Status Updates Modal
function openIndividualStatusModal(fineId) {
    document.getElementById('statusChangeForm').reset();
    document.getElementById('statusChangeTargetMode').value = 'INDIVIDUAL';
    document.getElementById('statusChangeFineId').value = fineId;
    
    document.getElementById('statusChangeCountContainer').style.display = 'none';
    
    openModal('statusChangeModal');
}

function openBulkStatusChangeModal() {
    document.getElementById('statusChangeForm').reset();
    document.getElementById('statusChangeTargetMode').value = 'BULK';
    
    document.getElementById('statusChangeCountContainer').style.display = 'block';
    document.getElementById('statusChangeCountDisplay').value = `${selectedFinesForBulk.size} fine(s) selected`;
    
    openModal('statusChangeModal');
}

safeAddListener('statusChangeForm', 'submit', function(e) {
    e.preventDefault();
    
    const mode = document.getElementById('statusChangeTargetMode').value;
    const newStatus = document.getElementById('newStatusSelect').value;
    const reason = document.getElementById('closureReasonSelect').value;
    const notes = document.getElementById('statusChangeNotes').value.trim();
    const noteContent = `${reason}. ${notes}`;
    
    if (mode === 'INDIVIDUAL') {
        const fineId = document.getElementById('statusChangeFineId').value;
        const fine = db.fines.find(f => f.id === fineId);
        if (!fine) return;
        
        const oldStatus = fine.status;
        fine.status = newStatus;
        fine.closed_at = newStatus === 'CLOSED' ? new Date().toISOString() : null;
        fine.updated_at = new Date().toISOString();
        
        saveTable(DB_KEYS.FINES, db.fines);
        
        logFineEdit(fine.id, 'status', oldStatus, newStatus, 'STATUS_CHANGED', noteContent);
        logAdminAction('FINE_STATUS_CHANGED', 'FINE', fine.id, `Status update on fine: "${oldStatus}" &rarr; "${newStatus}" (Reason: ${reason}).`);
        showToast('Fine status updated successfully.', 'success');
        
    } else if (mode === 'BULK') {
        selectedFinesForBulk.forEach(id => {
            const fine = db.fines.find(f => f.id === id);
            if (fine && fine.status !== newStatus) {
                const oldStatus = fine.status;
                fine.status = newStatus;
                fine.closed_at = newStatus === 'CLOSED' ? new Date().toISOString() : null;
                fine.updated_at = new Date().toISOString();
                
                logFineEdit(fine.id, 'status', oldStatus, newStatus, 'STATUS_CHANGED', noteContent);
            }
        });
        
        saveTable(DB_KEYS.FINES, db.fines);
        logAdminAction('FINE_STATUS_CHANGED', 'FINE', null, `Bulk status update to ${newStatus} on ${selectedFinesForBulk.size} fines (Reason: ${reason}).`);
        showToast(`Successfully updated status on ${selectedFinesForBulk.size} records.`, 'success');
        
        selectedFinesForBulk.clear();
        document.getElementById('selectAllFinesCheckbox').checked = false;
        updateBulkActionBar();
    }
    
    closeModal('statusChangeModal');
    loadFineList();
});

// Fine details & Edit history viewing modal
let auditTrailListCollapsed = false;

function openFineDetailsModal(id) {
    const fine = db.fines.find(f => f.id === id);
    if (!fine) return;
    
    const student = db.students.find(s => s.id === fine.student_id);
    const category = db.violations.find(v => v.id === fine.violation_category_id);
    
    if (!student) return;
    
    // Fill Student Information Header
    document.getElementById('fdStudentName').innerText = student.name;
    document.getElementById('fdRollNumber').innerText = student.roll_number;
    document.getElementById('fdEmailId').innerText = student.email_id;
    document.getElementById('fdCohort').innerText = getCohortDisplayLabel(student.cohort);
    
    // Calculate cumulative flag counter and breakdowns
    const allStudentFines = db.fines.filter(f => f.student_id === student.id && !f.is_deleted);
    document.getElementById('fdTotalFinesRegistered').innerText = `${allStudentFines.length} fine record(s)`;
    
    // Flag counts mapping (only count flags of OPEN active ones)
    const activeOpenFines = allStudentFines.filter(f => f.status === 'OPEN');
    let cumFlags = 0;
    const breakdownObj = {};
    
    activeOpenFines.forEach(f => {
        cumFlags += (f.red_flags || 0);
        if (f.red_flags > 0) {
            const cat = db.violations.find(v => v.id === f.violation_category_id);
            if (cat) {
                const parentCat = cat.parent_category;
                breakdownObj[parentCat] = (breakdownObj[parentCat] || 0) + f.red_flags;
            }
        }
    });
    
    document.getElementById('fdRedFlagCount').innerText = `${cumFlags} / 3`;
    const flagDisplay = document.getElementById('fdRedFlagCount').parentElement;
    if (cumFlags >= 3) {
        flagDisplay.style.backgroundColor = 'var(--color-danger)';
        flagDisplay.style.color = 'white';
    } else {
        flagDisplay.style.backgroundColor = 'rgba(255,255,255,0.1)';
        flagDisplay.style.color = 'white';
    }
    
    // Format flag breakdown string
    const breakdownKeys = Object.entries(breakdownObj);
    if (breakdownKeys.length > 0) {
        const pieces = breakdownKeys.map(([cat, flagCount]) => `${flagCount}x ${cat}`);
        document.getElementById('fdRedFlagBreakdown').innerText = `Breakdown: ${pieces.join(', ')}`;
    } else {
        document.getElementById('fdRedFlagBreakdown').innerText = 'No active red flag violations logged.';
    }
    
    // Calculate monetary summaries
    const pendingSum = allStudentFines.filter(f => f.status === 'OPEN').reduce((sum, f) => sum + (f.monetary_penalty_amount || 0), 0);
    const paidSum = allStudentFines.filter(f => f.status === 'CLOSED').reduce((sum, f) => sum + (f.monetary_penalty_amount || 0), 0);
    const carriedSum = allStudentFines.filter(f => f.status === 'CARRIED_FORWARD').reduce((sum, f) => sum + (f.monetary_penalty_amount || 0), 0);
    
    document.getElementById('fdPendingAmt').innerText = formatINR(pendingSum);
    document.getElementById('fdPaidAmt').innerText = formatINR(paidSum);
    document.getElementById('fdWaivedAmt').innerText = formatINR(carriedSum);
    
    // Render list of fines
    const tbody = document.getElementById('fdFinesTableBody');
    tbody.innerHTML = '';
    
    allStudentFines.forEach(f => {
        const cat = db.violations.find(v => v.id === f.violation_category_id);
        const tr = document.createElement('tr');
        
        let statText = '';
        if (f.status === 'OPEN') statText = '<span class="badge badge-open">Open</span>';
        else if (f.status === 'CLOSED') statText = '<span class="badge badge-closed">Closed</span>';
        else if (f.status === 'CARRIED_FORWARD') statText = '<span class="badge badge-carried">Carried</span>';
        
        tr.innerHTML = `
            <td style="font-weight: 500;">${cat ? cat.category_name : 'Unknown'}</td>
            <td style="font-family: monospace; font-size: 12px; font-weight: 600;">${f.session || 'N/A'}</td>
            <td>${f.monetary_penalty_amount !== null ? formatINR(f.monetary_penalty_amount) : '₹0'}</td>
            <td><span class="red-flags-count-badge ${f.red_flags === 0 ? 'zero' : ''}">${f.red_flags}</span></td>
            <td>${statText}</td>
            <td style="font-family: monospace; font-size: 11px;">${f.differentiation_tag || 'N/A'}</td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="openEditFineModal('${f.id}'); closeModal('fineDetailModal');" title="Edit">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Render selected Fine edit audit trails
    const fineAudits = db.auditTrail.filter(a => a.fine_id === id);
    const auditUl = document.getElementById('fdAuditTrailList');
    auditUl.innerHTML = '';
    
    if (fineAudits.length === 0) {
        auditUl.innerHTML = `<li style="font-size: 12px; color: var(--color-text-muted); text-align: center; padding: 10px 0;">No edits logged for this fine record.</li>`;
    } else {
        fineAudits.forEach(audit => {
            const li = document.createElement('li');
            li.className = 'audit-history-item';
            
            let diffHtml = '';
            if (audit.change_type === 'CREATED') {
                diffHtml = `Fine initialized with status <strong>${audit.new_value}</strong>.`;
            } else if (audit.change_type === 'DELETED') {
                diffHtml = `Fine moved to deleted trash history.`;
            } else if (audit.change_type === 'STATUS_CHANGED') {
                diffHtml = `Status changed: <strong>${audit.old_value} &rarr; ${audit.new_value}</strong>.`;
            } else {
                diffHtml = `Field <strong>${audit.changed_field}</strong> updated from <em>"${audit.old_value}"</em> to <strong>"${audit.new_value}"</strong>.`;
            }
            
            li.innerHTML = `
                <div class="audit-history-time">${formatDate(audit.change_timestamp)}</div>
                <div class="audit-history-diff">${diffHtml}</div>
                ${audit.admin_action_note ? `<div class="audit-history-note">Note: "${audit.admin_action_note}"</div>` : ''}
            `;
            auditUl.appendChild(li);
        });
    }
    
    // Expand list on load
    auditTrailListCollapsed = false;
    document.getElementById('fdAuditTrailList').style.display = 'flex';
    document.getElementById('fdAuditCollapseIcon').style.transform = 'rotate(0deg)';
    
    openModal('fineDetailModal');
}

function toggleAuditTrailListCollapse() {
    const list = document.getElementById('fdAuditTrailList');
    const icon = document.getElementById('fdAuditCollapseIcon');
    
    auditTrailListCollapsed = !auditTrailListCollapsed;
    if (auditTrailListCollapsed) {
        list.style.display = 'none';
        icon.style.transform = 'rotate(180deg)';
    } else {
        list.style.display = 'flex';
        icon.style.transform = 'rotate(0deg)';
    }
}

// ==========================================
// 8. DATA EXPORTS CAPABILITIES
// ==========================================

function openExportModal() {
    openModal('exportModal');
}

function executeExport() {
    // 1. Gather checklist fields
    const selectedFields = [];
    document.querySelectorAll('.export-checklist input:checked').forEach(chk => {
        selectedFields.push(chk.value);
    });
    
    if (selectedFields.length === 0) {
        showToast('Please select at least one field to export', 'warning');
        return;
    }
    
    const format = document.getElementById('exportFormat').value;
    const inclusion = document.getElementById('exportSoftDeleteInclusion').value;
    
    // 2. Fetch data based on current UI filters (Respecting filters)
    let currentCohort = '';
    let currentSearch = '';
    let currentRedFlag = '';
    let currentMultiCat = false;
    let eventIdFilter = null;
    let eventTabFilter = null;

    if (currentView === 'manage-event') {
        const event = db.events.find(e => e.id === currentSelectedEventId);
        if (event) {
            currentCohort = event.cohort;
            currentSearch = document.getElementById('eventDetailSearchInput').value.trim().toLowerCase();
            eventIdFilter = event.id;
            eventTabFilter = currentEventDetailTab;
        }
    } else {
        currentCohort = document.getElementById('fineCohortFilter').value;
        currentSearch = document.getElementById('fineSearchInput').value.trim().toLowerCase();
        currentRedFlag = document.getElementById('fineRedFlagFilter').value;
        currentMultiCat = document.getElementById('fineMultipleCategoriesCheckbox').checked;
    }

    // Build real-time flag counts map
    const studentFlags = {};
    const studentFinesCount = {};
    db.fines.forEach(f => {
        if (!f.is_deleted) {
            studentFlags[f.student_id] = (studentFlags[f.student_id] || 0) + (f.red_flags || 0);
        }
        if (!f.is_deleted) {
            if (!studentFinesCount[f.student_id]) studentFinesCount[f.student_id] = new Set();
            const cat = db.violations.find(v => v.id === f.violation_category_id);
            if (cat) studentFinesCount[f.student_id].add(cat.parent_category);
        }
    });

    const filtered = db.fines.map(f => {
        const student = db.students.find(s => s.id === f.student_id);
        const cat = db.violations.find(v => v.id === f.violation_category_id);
        const cumFlags = student ? (studentFlags[student.id] || 0) : 0;
        
        return {
            ...f,
            studentName: student ? student.name : 'Unknown',
            rollNumber: student ? student.roll_number : 'N/A',
            emailId: student ? student.email_id : 'N/A',
            category: cat ? cat.category_name : 'Unknown',
            parentCategory: cat ? cat.parent_category : 'Unknown',
            cumulativeFlags: cumFlags,
            categoryCount: student ? (studentFinesCount[student.id]?.size || 0) : 0
        };
    }).filter(f => {
        // Soft delete logic
        if (inclusion === 'exclude' && f.is_deleted) return false;
        if (inclusion === 'only' && !f.is_deleted) return false;
        
        if (currentView === 'manage-event') {
            // Only export fines for this event
            if (f.event_id !== eventIdFilter) return false;

            // Map tab status: REGISTERED, FINED, PAID_FINE, CLOSED
            if (eventTabFilter === 'FINED' && f.status !== 'OPEN') return false;
            if (eventTabFilter === 'PAID_FINE' && f.status !== 'PROOF_SUBMITTED') return false;
            if (eventTabFilter === 'CLOSED' && f.status !== 'CLOSED') return false;
            // Note: REGISTERED tab has no fines associated directly by definition (they are registered/attended, not fined).
            // Exporting REGISTERED tab defaults to exporting all event fines.
        } else {
            // Fine Management only shows direct fines (event_id is null/undefined)
            if (f.event_id) return false;
            
            if (inclusion !== 'only' && inclusion !== 'include') {
                if (f.status !== fineTab) return false;
            }
        }

        // Active filters
        if (currentSearch) {
            const matchesName = f.studentName.toLowerCase().includes(currentSearch);
            const matchesRoll = f.rollNumber.toLowerCase().includes(currentSearch);
            if (!matchesName && !matchesRoll) return false;
        }
        if (currentCohort && f.cohort !== currentCohort) return false;
        
        if (currentView !== 'manage-event' && fineCategoryFilter.length > 0 && !fineCategoryFilter.includes(f.parentCategory)) return false;
        
        if (currentRedFlag) {
            if (f.cumulativeFlags < parseInt(currentRedFlag)) return false;
        }
        if (currentMultiCat && f.categoryCount < 2) return false;
        
        return true;
    });

    if (filtered.length === 0) {
        showToast('No records found matching filters to export.', 'warning');
        return;
    }

    // 3. Generate CSV content
    const headersMap = {
        studentName: 'Student Name',
        rollNumber: 'Roll Number',
        emailId: 'Email ID',
        cohort: 'Cohort',
        category: 'Violation Category',
        penalty: 'Monetary Penalty Amount',
        redFlags: 'Red Flags',
        status: 'Status',
        diffTag: 'Differentiation Tag',
        comments: 'Notes/Comments',
        cumulativeFlags: 'Current Red Flag Count',
        createdAt: 'Created Date',
        closedAt: 'Closed/Updated Date'
    };

    const csvHeaders = selectedFields.map(f => headersMap[f]);
    let csvRows = [csvHeaders.join(',')];

    filtered.forEach(row => {
        const line = selectedFields.map(field => {
            let val = '';
            
            if (field === 'studentName') val = row.studentName;
            else if (field === 'rollNumber') val = row.rollNumber;
            else if (field === 'emailId') val = row.emailId;
            else if (field === 'cohort') val = row.cohort;
            else if (field === 'category') val = row.category;
            else if (field === 'penalty') {
                val = row.monetary_penalty_amount !== null ? row.monetary_penalty_amount : 0;
                if (format === 'xlsx') val = `₹${val}`; // add currency format for Excel
            }
            else if (field === 'redFlags') val = row.red_flags;
            else if (field === 'status') val = row.status;
            else if (field === 'diffTag') val = row.differentiation_tag || '';
            else if (field === 'comments') val = row.notes_comments || '';
            else if (field === 'cumulativeFlags') val = row.cumulativeFlags;
            else if (field === 'createdAt') val = formatDate(row.created_at);
            else if (field === 'closedAt') val = row.closed_at ? formatDate(row.closed_at) : '';

            // Escape commas and quotes for CSV stability
            val = val.toString().replace(/"/g, '""');
            if (val.includes(',') || val.includes('\n') || val.includes('"')) {
                val = `"${val}"`;
            }
            return val;
        });
        csvRows.push(line.join(','));
    });

    const csvContent = "\uFEFF" + csvRows.join('\n'); // UTF-8 BOM

    // 4. Trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    // Naming pattern: Fine_Management_Export_[Cohort]_[Date].[csv/xlsx]
    const cohortStr = currentCohort || 'All';
    const dateStr = new Date().toISOString().split('T')[0];
    const extension = format === 'xlsx' ? 'csv' : 'csv'; // we output CSV standard
    
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Fine_Management_Export_${cohortStr}_${dateStr}.${extension}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    logAdminAction('FILE_EXPORT', 'FINE', null, `Exported ${filtered.length} fine records to CSV (Selected: ${selectedFields.length} fields).`);
    showToast('Registry export generated successfully', 'success');
    closeModal('exportModal');
}

// ==========================================
// 9. BULK CSV IMPORT VALIDATIONS
// ==========================================

let studentImportBatch = [];
let fineImportBatch = [];
let paymentImportBatch = [];

// Drag and drop setup for Student imports
setupDragAndDrop('studentDropzone', 'studentFileInput', function(csvContent) {
    const rows = parseCSVContent(csvContent);
    if (rows.length < 2) {
        showToast('Empty or invalid CSV file.', 'danger');
        return;
    }
    
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const expectedHeaders = ['name', 'roll number', 'email id', 'cohort'];
    
    // Validate headers
    const hasHeaders = expectedHeaders.every(h => headers.includes(h));
    if (!hasHeaders) {
        showToast('Invalid CSV headers. Headers must include Name, Roll Number, Email ID, Cohort', 'danger');
        return;
    }

    const nameIdx = headers.indexOf('name');
    const rollIdx = headers.indexOf('roll number');
    const emailIdx = headers.indexOf('email id');
    const cohortIdx = headers.indexOf('cohort');

    studentImportBatch = [];
    let validCount = 0;
    let failedCount = 0;

    const listContainer = document.getElementById('studentPreviewListRows');
    listContainer.innerHTML = '';

    // Track unique rolls within the upload batch to detect batch duplicates
    const batchRolls = {};

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2 || (row.length === 1 && row[0] === '')) continue; // skip blank rows

        const name = row[nameIdx]?.trim() || '';
        const roll = row[rollIdx]?.trim().toUpperCase() || '';
        const email = row[emailIdx]?.trim() || '';
        let cohort = row[cohortIdx]?.trim() || '';
        
        // Smart cohort detection from Roll Number prefix first
        const detectedCohort = resolveCohortFromRollNumber(roll);
        if (detectedCohort) {
            cohort = detectedCohort;
        } else {
            // Normal fallback normalization
            if (cohort.toLowerCase().includes('summer') || cohort.toLowerCase().includes('sip')) cohort = 'SUMMER_2026_27';
            else if (cohort.toLowerCase().includes('final')) cohort = 'FINAL_2026_27';
        }

        let isValid = true;
        let errors = [];

        // Mandatory fields check
        if (!name || !roll || !email || !cohort) {
            isValid = false;
            errors.push('Missing mandatory fields (Name, Roll, Email, Cohort are required)');
        }

        // Email validation
        if (email && !validateEmail(email)) {
            isValid = false;
            errors.push('Invalid email format');
        }

        // Cohort validation
        if (cohort && cohort !== 'SUMMER_2026_27' && cohort !== 'FINAL_2026_27') {
            isValid = false;
            errors.push('Cohort must be Summer or Final');
        }

        // Database level uniqueness checks
        if (roll) {
            // Check duplicate in same batch upload (warning check)
            if (batchRolls[roll]) {
                isValid = false;
                errors.push(`Duplicate roll number detected in same upload batch (Row ${batchRolls[roll]} and Row ${i})`);
            } else {
                batchRolls[roll] = i;
            }

            // Check duplicate in existing database across cohorts
            const exists = db.students.find(s => s.roll_number === roll && !s.is_deleted);
            if (exists) {
                isValid = false;
                errors.push(exists.cohort === cohort
                    ? `Roll number already exists in ${cohort} cohort`
                    : `Roll number exists in ${exists.cohort} cohort. Cannot exist in both.`);
            }
        }

        if (isValid) validCount++;
        else failedCount++;

        const batchItem = { rowNum: i, name, roll_number: roll, email_id: email, cohort, isValid, errors };
        studentImportBatch.push(batchItem);

        // Append to preview row UI
        const previewRow = document.createElement('div');
        previewRow.className = `preview-row ${isValid ? '' : 'has-error'}`;
        previewRow.innerHTML = `
            <div>Row ${i}</div>
            <div style="font-family: monospace;">${roll || 'N/A'}</div>
            <td>${name || 'N/A'}</td>
            <div>
                <span style="font-weight:600;">${isValid ? 'OK (Valid)' : 'Validation Failure'}</span>
                ${errors.length > 0 ? `<div class="preview-status-msg">&bull; ${errors.join('<br>&bull; ')}</div>` : ''}
            </div>
        `;
        listContainer.appendChild(previewRow);
    }

    // Toggle Preview UI
    document.getElementById('studentPreviewContainer').style.display = 'block';
    document.getElementById('studentPreviewValidCount').innerText = validCount;
    document.getElementById('studentPreviewFailedCount').innerText = failedCount;
    
    // Enable/disable confirm button based on valid records availability
    document.getElementById('btnConfirmStudentImport').disabled = (validCount === 0);
});

function executeStudentImport() {
    const importable = studentImportBatch.filter(item => item.isValid);
    if (importable.length === 0) return;

    let added = 0;
    const newStudents = [];

    importable.forEach(item => {
        const student = {
            id: generateUUID(),
            name: item.name,
            roll_number: item.roll_number,
            email_id: item.email_id,
            cohort: item.cohort,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_deleted: false,
            deleted_at: null
        };
        db.students.push(student);
        newStudents.push(student);
        added++;
    });

    saveTable(DB_KEYS.STUDENTS, db.students);
    
    logAdminAction('BULK_IMPORT', 'STUDENT', null, `Bulk imported ${added} students successfully.`);
    showToast(`Successfully imported ${added} student records!`, 'success');
    
    closeModal('bulkImportStudentsModal');
    loadStudentList();

    // Async Bulk Sync in background
    if (supabaseClient && newStudents.length > 0) {
        supabaseClient.from('students').upsert(newStudents)
            .then(({ error }) => {
                if (error) console.error('Cloud sync error for bulk students:', error);
                else console.log('Successfully synced student batch to cloud.');
            })
            .catch(err => console.error(err));
    }
}

// Drag and drop for Fines imports
setupDragAndDrop('fineDropzone', 'fineFileInput', function(csvContent) {
    const rows = parseCSVContent(csvContent);
    if (rows.length < 2) {
        showToast('Empty or invalid CSV file.', 'danger');
        return;
    }
    
    const headers = rows[0].map(h => h.trim().toLowerCase());
    
    // Flexible header mapping supporting both standard and exported column names
    const rollIdx = headers.findIndex(h => h.includes('roll'));
    const cohortIdx = headers.findIndex(h => h.includes('cohort'));
    const catIdx = headers.findIndex(h => h.includes('category') || h.includes('violation'));
    const sessionIdx = headers.findIndex(h => h.includes('session') || h.includes('event'));
    const amtIdx = headers.findIndex(h => h.includes('amount') || h.includes('penalty') || h.includes('fine'));
    const flagIdx = headers.findIndex(h => h.includes('flag'));
    const tagIdx = headers.findIndex(h => h.includes('tag') || h.includes('differentiation'));
    const notesIdx = headers.findIndex(h => h.includes('note') || h.includes('comment'));
    const statusIdx = headers.findIndex(h => h.includes('status'));

    if (rollIdx === -1 || catIdx === -1) {
        showToast('Invalid CSV format. Roll Number and Violation Category are mandatory headers.', 'danger');
        return;
    }

    fineImportBatch = [];
    let validCount = 0;
    let warningCount = 0;
    let failedCount = 0;

    const listContainer = document.getElementById('finePreviewListRows');
    listContainer.innerHTML = '';

    const batchCheck = {}; // duplicate checker in upload batch

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2 || (row.length === 1 && row[0] === '')) continue;

        const roll = row[rollIdx]?.trim().toUpperCase() || '';
        let cohort = cohortIdx !== -1 ? (row[cohortIdx]?.trim() || '') : '';
        const categoryName = row[catIdx]?.trim() || '';
        const session = sessionIdx !== -1 ? (row[sessionIdx]?.trim() || '') : 'Direct Import';
        
        let amount = amtIdx !== -1 ? parseFloat(row[amtIdx]?.trim()) : NaN;
        let flags = flagIdx !== -1 ? parseInt(row[flagIdx]?.trim()) : NaN;
        const diffTag = tagIdx !== -1 ? (row[tagIdx]?.trim() || '') : '';
        const notes = notesIdx !== -1 ? (row[notesIdx]?.trim() || '') : '';

        let statusVal = statusIdx !== -1 ? (row[statusIdx]?.trim().toUpperCase() || 'OPEN') : 'OPEN';
        if (statusVal === 'PAID' || statusVal === 'PROOF_SUBMITTED' || statusVal === 'PROOF SUBMITTED') {
            statusVal = 'PROOF_SUBMITTED';
        } else if (statusVal === 'CLOSED' || statusVal === 'WAIVED') {
            statusVal = 'CLOSED';
        } else if (statusVal === 'CARRIED_FORWARD' || statusVal === 'CARRIED' || statusVal === 'FORWARD') {
            statusVal = 'CARRIED_FORWARD';
        } else {
            statusVal = 'OPEN';
        }

        // Smart cohort detection from Roll Number prefix first
        const detectedCohort = resolveCohortFromRollNumber(roll);
        if (detectedCohort) {
            cohort = detectedCohort;
        } else {
            // Normal fallback normalization
            if (cohort.toLowerCase().includes('summer') || cohort.toLowerCase().includes('sip')) cohort = 'SUMMER_2026_27';
            else if (cohort.toLowerCase().includes('final')) cohort = 'FINAL_2026_27';
        }

        let isValid = true;
        let isWarning = false;
        let statusMsg = 'Valid';
        let detailMsg = [];
        let choiceAction = 'Import';

        // 0. Session validation
        if (!session) {
            isValid = false;
            detailMsg.push('Session is a mandatory field.');
        }

        // 1. Roll number validation
        const student = db.students.find(s => s.roll_number === roll && !s.is_deleted);
        if (!student) {
            isValid = false;
            detailMsg.push(`Roll number ${roll} not found in Student Master.`);
        } else {
            // Roll number matches student, grab details
            cohort = student.cohort; // force actual student cohort
        }

        // 2. Violation Category validation
        const violation = db.violations.find(v => v.category_name.toLowerCase() === categoryName.toLowerCase() && v.cohort === cohort);
        if (!violation) {
            isValid = false;
            detailMsg.push(`Violation category "${categoryName}" does not match seeded rules for ${cohort} cohort.`);
        }

        // Auto-update cohort and monetary amount based on master records, ignoring CSV overrides
        if (violation) {
            amount = violation.monetary_penalty_amount !== null ? violation.monetary_penalty_amount : 0;
            flags = violation.red_flag_count !== null ? violation.red_flag_count : 0;
        }

        // Penalty limits check
        if (amount < 0) {
            isValid = false;
            detailMsg.push('Penalty amount must be greater than or equal to 0.');
        }
        if (flags < 0 || flags > 3) {
            isValid = false;
            detailMsg.push('Red flags must be between 0 and 3.');
        }
        if (amount === 0 && flags === 0) {
            isValid = false;
            detailMsg.push('At least one of penalty or red flags must be present.');
        }

        // 3. Warning/Conflict detection
        if (isValid && student && violation) {
            const key = `${roll}_${violation.id}`;
            
            // Check duplicate in same upload batch
            if (batchCheck[key]) {
                isWarning = true;
                detailMsg.push('Duplicate row found in upload batch. (Imports as separate fines)');
            } else {
                batchCheck[key] = true;
            }

            // Check if open fine already exists in database in same category (warning check)
            const existsOpen = db.fines.find(f => !f.is_deleted && f.student_id === student.id && f.violation_category_id === violation.id && f.status === 'OPEN');
            if (existsOpen) {
                isWarning = true;
                detailMsg.push('Conflict: Student already has an active open fine in this same category.');
                choiceAction = 'Resolve Add';
            }
        }

        if (!isValid) failedCount++;
        else if (isWarning) warningCount++;
        else validCount++;

        const batchItem = {
            rowNum: i,
            student_id: student ? student.id : null,
            studentName: student ? student.name : 'Unknown',
            roll,
            cohort,
            session,
            violation_category_id: violation ? violation.id : null,
            monetary_penalty_amount: amount,
            red_flags: flags,
            differentiation_tag: diffTag || `Violation-${i}`,
            notes_comments: notes,
            status: statusVal,
            isValid,
            isWarning,
            detailMsg
        };
        fineImportBatch.push(batchItem);

        // Preview rendering
        const previewRow = document.createElement('div');
        previewRow.className = `preview-row ${!isValid ? 'has-error' : (isWarning ? 'has-warning' : '')}`;
        previewRow.style.gridTemplateColumns = '0.6fr 1fr 1.5fr 1.8fr 1.1fr';
        
        previewRow.innerHTML = `
            <div>Row ${i}</div>
            <div style="font-family: monospace;">${roll || 'N/A'}</div>
            <div style="font-size: 11px;">${categoryName || 'N/A'}</div>
            <div>
                <span style="font-weight:600;">${!isValid ? 'Error (Skipped)' : (isWarning ? 'Warning (Confirm)' : 'Ready')}</span>
                ${detailMsg.length > 0 ? `<div class="preview-status-msg">&bull; ${detailMsg.join('<br>&bull; ')}</div>` : ''}
            </div>
            <div>
                ${!isValid ? '<span style="color:var(--color-danger);font-weight:600;">Skip</span>' : 
                `<select class="page-size-selector" style="font-size:11px;padding:2px 4px;" onchange="updateFineImportRowAction(${i}, this.value)">
                    <option value="import">Import Record</option>
                    <option value="skip">Skip Row</option>
                </select>`}
            </div>
        `;
        listContainer.appendChild(previewRow);
    }

    document.getElementById('finePreviewContainer').style.display = 'block';
    document.getElementById('finePreviewValidCount').innerText = validCount;
    document.getElementById('finePreviewWarningCount').innerText = warningCount;
    document.getElementById('finePreviewFailedCount').innerText = failedCount;

    document.getElementById('btnConfirmFineImport').disabled = (validCount + warningCount === 0);
});

function updateFineImportRowAction(rowNum, value) {
    const item = fineImportBatch.find(f => f.rowNum === rowNum);
    if (item) {
        item.userOverrideAction = value; // 'import' or 'skip'
    }
}

function executeFineImport() {
    let importedCount = 0;
    const newFines = [];
    
    fineImportBatch.forEach(item => {
        if (!item.isValid) return; // skip fails
        if (item.userOverrideAction === 'skip') return; // skip user deselected
        
        const status = item.status || 'OPEN';
        const fine = {
            id: generateUUID(),
            student_id: item.student_id,
            violation_category_id: item.violation_category_id,
            cohort: item.cohort,
            monetary_penalty_amount: item.monetary_penalty_amount,
            red_flags: item.red_flags,
            session: item.session,
            status: status,
            differentiation_tag: item.differentiation_tag,
            notes_comments: item.notes_comments,
            event_id: null,
            source: 'DIRECT_BULK',
            created_at: new Date().toISOString(),
            closed_at: status === 'CLOSED' ? new Date().toISOString() : null,
            is_deleted: false,
            deleted_at: null
        };
        db.fines.push(fine);
        newFines.push(fine);
        importedCount++;
        
        logFineEdit(fine.id, 'status', null, status, 'CREATED', 'Registered via Bulk Upload process', false);
    });

    saveTable(DB_KEYS.FINES, db.fines);
    saveTable(DB_KEYS.AUDIT_TRAIL, db.auditTrail);
    logAdminAction('BULK_IMPORT', 'FINE', null, `Bulk uploaded ${importedCount} fines successfully.`);
    showToast(`Successfully uploaded ${importedCount} fines to registry!`, 'success');
    
    closeModal('bulkImportFinesModal');
    loadFineList();

    // Async Bulk Sync in background
    if (supabaseClient && newFines.length > 0) {
        supabaseClient.from('fines').upsert(newFines)
            .then(({ error }) => {
                if (error) console.error('Cloud sync error for bulk fines:', error);
                else console.log('Successfully synced fine batch to cloud.');
            })
            .catch(err => console.error(err));
    }
}

// Drag and drop for Payment Confirmations
setupDragAndDrop('paymentDropzone', 'paymentFileInput', function(csvContent) {
    const rows = parseCSVContent(csvContent);
    if (rows.length < 2) {
        showToast('Empty or invalid CSV file.', 'danger');
        return;
    }
    
    const headers = rows[0].map(h => h.trim().toLowerCase());
    
    // Required headers: Name, Roll Number, Email ID, Category of Fine
    const rollIdx = headers.indexOf('roll number');
    const catIdx = headers.indexOf('category of fine');
    const statusIdx = headers.indexOf('new resolution status');
    const reasonIdx = headers.indexOf('predefined closure reason');
    const commentsIdx = headers.indexOf('audit notes / comments');

    if (rollIdx === -1 || catIdx === -1) {
        showToast('Invalid CSV format. Roll Number and Category of Fine are required.', 'danger');
        return;
    }

    function normalizeStatus(str) {
        const s = (str || '').trim().toUpperCase();
        if (s.includes('CLOSED')) return 'CLOSED';
        if (s.includes('CARRIED') || s.includes('FORWARD')) return 'CARRIED_FORWARD';
        if (s.includes('OPEN')) return 'OPEN';
        return 'CLOSED'; // default
    }

    paymentImportBatch = [];
    let matchCount = 0;
    let ambiguousCount = 0;
    let mismatchCount = 0;

    const listContainer = document.getElementById('paymentPreviewListRows');
    listContainer.innerHTML = '';

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2 || (row.length === 1 && row[0] === '')) continue;

        const roll = row[rollIdx]?.trim().toUpperCase() || '';
        const reportedCategory = row[catIdx]?.trim() || '';

        let status = 'MISMATCH'; // MATCH, AMBIGUOUS, MISMATCH
        let detailMsg = [];
        let optionsHtml = '';
        let matchingFineIds = [];
        
        const student = db.students.find(s => s.roll_number === roll && !s.is_deleted);
        if (!student) {
            detailMsg.push('Student roll number not found in Master registry.');
        } else {
            // Find all open active fines in this parent category for the student
            const openFines = db.fines.filter(f => {
                if (f.is_deleted || f.student_id !== student.id || f.status !== 'OPEN') return false;
                
                const cat = db.violations.find(v => v.id === f.violation_category_id);
                if (!cat) return false;
                
                // Compare category name or parent category name (fuzzy check)
                const matchName = cat.category_name.toLowerCase().includes(reportedCategory.toLowerCase()) || 
                                  reportedCategory.toLowerCase().includes(cat.category_name.toLowerCase()) ||
                                  cat.parent_category.toLowerCase().includes(reportedCategory.toLowerCase());
                return matchName;
            });

            if (openFines.length === 0) {
                detailMsg.push(`No active open fines found for student in category resembling "${reportedCategory}".`);
            } else if (openFines.length === 1) {
                status = 'MATCH';
                const f = openFines[0];
                matchingFineIds.push(f.id);
                detailMsg.push(`Matched fine of ₹${f.monetary_penalty_amount} (${f.differentiation_tag || 'no tag'}).`);
                optionsHtml = `<span style="color:var(--color-success);font-weight:600;">Auto-match</span>`;
                matchCount++;
            } else {
                status = 'AMBIGUOUS';
                matchingFineIds = openFines.map(f => f.id);
                detailMsg.push(`Found ${openFines.length} open fines matching reported category. Please select which fine to close.`);
                
                // Draw dropdown selector
                optionsHtml = `<select class="page-size-selector" style="font-size:11px;padding:2px 4px;width:100%;" onchange="resolveAmbiguousPaymentRow(${i}, this.value)">
                    <option value="" disabled selected>Select fine to close</option>
                    ${openFines.map(f => `<option value="${f.id}">₹${f.monetary_penalty_amount} (${f.differentiation_tag})</option>`).join('')}
                    <option value="all">Close All (${openFines.length} fines)</option>
                    <option value="skip">Skip/Do Not Close</option>
                </select>`;
                ambiguousCount++;
            }
        }

        if (status === 'MISMATCH') {
            optionsHtml = `<span style="color:var(--color-danger);font-weight:600;">Skip Row</span>`;
            mismatchCount++;
        }

        let newStatus = statusIdx !== -1 ? (row[statusIdx]?.trim() || 'CLOSED') : 'CLOSED';
        let closureReason = reasonIdx !== -1 ? (row[reasonIdx]?.trim() || 'Payment Received') : 'Payment Received';
        let auditComments = commentsIdx !== -1 ? (row[commentsIdx]?.trim() || 'Bulk import payment process') : 'Bulk import payment process';

        const batchItem = {
            rowNum: i,
            roll,
            student_id: student ? student.id : null,
            reportedCategory,
            newStatus: normalizeStatus(newStatus),
            closureReason,
            auditComments,
            status,
            matchingFineIds,
            selectedFineIdToClose: status === 'MATCH' ? matchingFineIds[0] : null // stores resolution
        };
        paymentImportBatch.push(batchItem);

        // UI row append
        const previewRow = document.createElement('div');
        previewRow.className = `preview-row ${status === 'MISMATCH' ? 'has-error' : (status === 'AMBIGUOUS' ? 'has-warning' : '')}`;
        previewRow.style.gridTemplateColumns = '0.6fr 1fr 1.5fr 1.8fr 1.1fr';
        
        previewRow.innerHTML = `
            <div>Row ${i}</div>
            <div style="font-family: monospace;">${roll || 'N/A'}</div>
            <div style="font-size: 11px;">${reportedCategory || 'N/A'}</div>
            <div>
                <span style="font-weight:600;">${status === 'MATCH' ? 'Fine Match Found' : (status === 'AMBIGUOUS' ? 'Conflict Match' : 'Mismatch')}</span>
                ${detailMsg.length > 0 ? `<div class="preview-status-msg">&bull; ${detailMsg.join('<br>&bull; ')}</div>` : ''}
            </div>
            <div>${optionsHtml}</div>
        `;
        listContainer.appendChild(previewRow);
    }

    document.getElementById('paymentPreviewContainer').style.display = 'block';
    document.getElementById('paymentPreviewMatchCount').innerText = matchCount;
    document.getElementById('paymentPreviewAmbiguousCount').innerText = ambiguousCount;
    document.getElementById('paymentPreviewMismatchCount').innerText = mismatchCount;

    document.getElementById('btnConfirmPaymentProcess').disabled = (matchCount + ambiguousCount === 0);
});

function resolveAmbiguousPaymentRow(rowNum, selectedValue) {
    const item = paymentImportBatch.find(p => p.rowNum === rowNum);
    if (item) {
        if (selectedValue === 'all') {
            item.selectedFineIdToClose = 'all';
        } else if (selectedValue === 'skip') {
            item.selectedFineIdToClose = 'skip';
        } else {
            item.selectedFineIdToClose = selectedValue; // fine UUID
        }
    }
}

function executePaymentProcessing() {
    let closedCount = 0;
    const updatedFines = [];

    paymentImportBatch.forEach(item => {
        if (item.status === 'MISMATCH') return;
        if (!item.selectedFineIdToClose || item.selectedFineIdToClose === 'skip') return;

        const updateFineRecord = (fine) => {
            const oldStatus = fine.status;
            fine.status = item.newStatus;
            fine.notes_comments = (fine.notes_comments ? fine.notes_comments + '\n' : '') + `[Import Update] Reason: ${item.closureReason}. Comments: ${item.auditComments}`;
            
            if (item.newStatus === 'CLOSED') {
                fine.closed_at = new Date().toISOString();
            } else if (item.newStatus === 'OPEN') {
                fine.closed_at = null; // reset if re-opened
            }
            fine.updated_at = new Date().toISOString();
            closedCount++;
            updatedFines.push(fine);
            logFineEdit(fine.id, 'status', oldStatus, item.newStatus, 'STATUS_CHANGED', `${item.closureReason}: ${item.auditComments}`, false);
        };

        if (item.selectedFineIdToClose === 'all') {
            // Close all matched fines
            item.matchingFineIds.forEach(id => {
                const fine = db.fines.find(f => f.id === id);
                if (fine) {
                    updateFineRecord(fine);
                }
            });
        } else {
            // Close specific fine ID
            const fine = db.fines.find(f => f.id === item.selectedFineIdToClose);
            if (fine) {
                updateFineRecord(fine);
            }
        }
    });

    saveTable(DB_KEYS.FINES, db.fines);
    saveTable(DB_KEYS.AUDIT_TRAIL, db.auditTrail);
    logAdminAction('BULK_IMPORT', 'PAYMENT_CONFIRMATION', null, `Processed payments. Marked ${closedCount} fines as CLOSED.`);
    showToast(`Payment processing complete. Closed ${closedCount} fines.`, 'success');
    
    closeModal('paymentConfirmationsModal');
    loadFineList();

    // Async Bulk Sync in background
    if (supabaseClient && updatedFines.length > 0) {
        supabaseClient.from('fines').upsert(updatedFines)
            .then(({ error }) => {
                if (error) console.error('Cloud sync error for bulk payment update:', error);
                else console.log('Successfully synced payments batch update to cloud.');
            })
            .catch(err => console.error(err));
    }
}

// ==========================================
// 10. COMPLIANCE & AUDIT LOG VIEWER
// ==========================================

function loadAuditLogs() {
    const filter = document.getElementById('auditActionTypeFilter').value;
    const tbody = document.getElementById('auditTableBody');
    tbody.innerHTML = '';
    
    let filteredLogs = db.actionLog;
    if (filter) {
        filteredLogs = db.actionLog.filter(log => log.action_type === filter);
    }
    
    if (filteredLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-secondary); padding: 30px;">No administrative audit actions registered.</td></tr>`;
        return;
    }
    
    filteredLogs.forEach(log => {
        const tr = document.createElement('tr');
        
        let typeBadge = '';
        if (log.action_type.includes('CREATED')) typeBadge = `<span class="badge badge-open" style="font-size:10px;">${log.action_type}</span>`;
        else if (log.action_type.includes('DELETED')) typeBadge = `<span class="badge badge-deleted" style="font-size:10px;">${log.action_type}</span>`;
        else if (log.action_type.includes('EDITED')) typeBadge = `<span class="badge badge-carried" style="font-size:10px;">${log.action_type}</span>`;
        else typeBadge = `<span class="badge badge-closed" style="font-size:10px;">${log.action_type}</span>`;

        tr.innerHTML = `
            <td style="white-space: nowrap; font-size: 13px; color: var(--color-text-secondary);">${formatDate(log.timestamp)}</td>
            <td style="font-weight: 600;">${log.admin_username}</td>
            <td>${typeBadge}</td>
            <td style="font-family: monospace; font-size: 12px;">${log.entity_id || 'N/A'}</td>
            <td style="font-size: 13px;">${log.details}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 11. GENERAL UTILITY FUNCTIONS & TRIGGERS
// ==========================================

// Standard modal handlers
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('show');
    document.body.style.overflow = '';
}

// Simple Toast Alerts
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconHtml = '';
    if (type === 'success') {
        iconHtml = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'danger') {
        iconHtml = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
        iconHtml = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    }
    
    toast.innerHTML = `
        ${iconHtml}
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // trigger animation reflow
    toast.offsetHeight;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// CSV Parser engine (supports basic comma splitting, escaped quotes)
function parseCSVContent(text) {
    const lines = [];
    let row = [""];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        let c = text[i];
        let next = text[i+1];

        if (c === '"') {
            if (inQuotes && next === '"') { 
                row[row.length - 1] += '"'; 
                i++; 
            } else { 
                inQuotes = !inQuotes; 
            }
        } else if (c === ',' && !inQuotes) {
            row.push('');
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') { i++; }
            lines.push(row);
            row = [''];
        } else {
            row[row.length - 1] += c;
        }
    }
    if (row.length > 1 || row[0] !== '') {
        lines.push(row);
    }
    return lines;
}

// Drag and drop helper installer
function setupDragAndDrop(zoneId, inputId, onParsedCallback) {
    const runSetup = () => {
        const zone = document.getElementById(zoneId);
        const input = document.getElementById(inputId);
        if (!zone || !input) return;

        zone.addEventListener('click', function(e) {
            if (e.target !== input) {
                input.click();
            }
        });

        zone.addEventListener('dragover', function(e) {
            e.preventDefault();
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', function() {
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', function(e) {
            e.preventDefault();
            zone.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleUploadedFile(files[0], onParsedCallback);
            }
        });

        input.addEventListener('change', function() {
            if (input.files.length > 0) {
                handleUploadedFile(input.files[0], onParsedCallback);
            }
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runSetup);
    } else {
        runSetup();
    }
}

function handleUploadedFile(file, onParsedCallback) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (extension !== 'csv' && extension !== 'xlsx' && extension !== 'xls') {
        showToast('Please select a valid CSV or Excel file (.csv, .xlsx, .xls).', 'danger');
        return;
    }

    const reader = new FileReader();
    if (extension === 'csv') {
        reader.onload = function(e) {
            onParsedCallback(e.target.result);
        };
        reader.readAsText(file);
    } else {
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const csvContent = XLSX.utils.sheet_to_csv(worksheet);
                onParsedCallback(csvContent);
            } catch (err) {
                console.error('Error reading Excel file:', err);
                showToast('Failed to parse Excel file. Please ensure it is not corrupted.', 'danger');
            }
        };
        reader.readAsArrayBuffer(file);
    }
}

// Trigger Modal open for bulk imports
function openBulkImportStudentsModal() {
    studentImportBatch = [];
    document.getElementById('studentFileInput').value = '';
    document.getElementById('studentPreviewContainer').style.display = 'none';
    document.getElementById('btnConfirmStudentImport').disabled = true;
    openModal('bulkImportStudentsModal');
}

function openBulkImportFinesModal() {
    fineImportBatch = [];
    document.getElementById('fineFileInput').value = '';
    document.getElementById('finePreviewContainer').style.display = 'none';
    document.getElementById('btnConfirmFineImport').disabled = true;
    openModal('bulkImportFinesModal');
}

function openPaymentConfirmationsModal() {
    paymentImportBatch = [];
    document.getElementById('paymentFileInput').value = '';
    document.getElementById('paymentPreviewContainer').style.display = 'none';
    document.getElementById('btnConfirmPaymentProcess').disabled = true;
    openModal('paymentConfirmationsModal');
}

// Generate template downloads dynamically
function downloadCSVTemplate(type) {
    let content = '';
    let filename = '';
    
    if (type === 'students') {
        content = "Name,Roll Number,Email ID,Cohort\n" +
                  "Rajesh Kumar,2510316,rajesh.kumar@iimv.ac.in,Summer\n" +
                  "Priya Singh,2510317,priya.singh@iimv.ac.in,Final\n";
        filename = 'Student_Master_Template.csv';
    } else if (type === 'fines') {
        content = "Roll Number,Violation Category,Session,Differentiation Tag,Notes\n" +
                  "2510316,Video Off/False Presence (Before Recruiter),Microsoft PPT,Violation-1,Was on mute during recruiter presentation\n" +
                  "2510317,Dress Code/Grooming Breach (Before Recruiter),Goldman GL,,Improper attire at interview\n";
        filename = 'Fine_Upload_Template.csv';
    } else if (type === 'payments') {
        content = "Roll Number,Category of Fine,New Resolution Status,Predefined Closure Reason,Audit Notes / Comments\n" +
                  "2510316,Video Off/False Presence (Before Recruiter),CLOSED,Payment Received,TXN987654321\n" +
                  "2510317,Dress Code/Grooming Breach (Before Recruiter),CARRIED_FORWARD,Waived,Waived by Chairperson due to genuine medical emergency\n";
        filename = 'Payment_Confirmation_Template.csv';
    } else if (type === 'Attendance') {
        content = "Name,Roll Number,Email ID,Date/Time Attended\n" +
                  "Rajesh Kumar,PGP2026S001,rajesh.kumar@iimv.ac.in,2026-07-12 10:00\n" +
                  "Priya Singh,PGP2026F001,priya.singh@iimv.ac.in,2026-07-12 10:05\n";
        filename = 'Event_Attendance_Template.csv';
    } else if (type === 'EventProof') {
        content = "Name,Roll Number,Email ID\n" +
                  "Rajesh Kumar,PGP2026S001,rajesh.kumar@iimv.ac.in\n" +
                  "Amit Patel,PGP2026S002,amit.patel@iimv.ac.in\n";
        filename = 'Event_Proof_Template.csv';
    } else if (type === 'violations') {
        content = "Roll Number,Name,Category,Penalty Override,Flags Override,Notes\n" +
                  "PGP2026S001,Rajesh Kumar,Video Off/False Presence (Before Recruiter),,,\n" +
                  "PGP2026S002,Amit Patel,Dress Code/Grooming Breach (Before Recruiter),1500,0,Custom override example\n";
        filename = 'Event_Violations_Template.csv';
    }

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadTemplate(type) {
    downloadCSVTemplate(type);
}

// Helpers
function generateUUID() {
    return 'uuid-' + Math.random().toString(36).substr(2, 9) + '-' + Math.random().toString(36).substr(2, 9);
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function formatINR(number) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(number);
}

function formatDate(isoString) {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function openDbSettingsModal() {
    document.getElementById('dbSupabaseUrl').value = localStorage.getItem(SUPABASE_KEYS.URL) || '';
    document.getElementById('dbSupabaseKey').value = localStorage.getItem(SUPABASE_KEYS.KEY) || '';
    openModal('dbSettingsModal');
}

function saveDbSettings(event) {
    event.preventDefault();
    const url = document.getElementById('dbSupabaseUrl').value.trim();
    const key = document.getElementById('dbSupabaseKey').value.trim();
    
    if (url && !key) {
        showToast('Supabase key is required to connect.', 'warning');
        return;
    }
    
    if (!url && key) {
        showToast('Supabase URL is required to connect.', 'warning');
        return;
    }
    
    const syncDirection = document.querySelector('input[name="dbSyncDirection"]:checked')?.value || 'pull';
    
    if (url && key) {
        localStorage.setItem(SUPABASE_KEYS.URL, url);
        localStorage.setItem(SUPABASE_KEYS.KEY, key);
        if (syncDirection === 'push') {
            localStorage.setItem('fms_force_push_next', 'true');
            showToast('Erase-and-push cloud overwrite scheduled. Connecting...', 'success');
        } else {
            showToast('Database configuration updated. Connecting...', 'success');
        }
    } else {
        localStorage.removeItem(SUPABASE_KEYS.URL);
        localStorage.removeItem(SUPABASE_KEYS.KEY);
        localStorage.removeItem('fms_force_push_next');
        showToast('Database configuration removed. Falling back to local.', 'warning');
    }
    
    closeModal('dbSettingsModal');
    
    // Reload the application state
    setTimeout(() => {
        location.reload();
    }, 1000);
}

async function testDbConnection() {
    const url = document.getElementById('dbSupabaseUrl').value.trim();
    const key = document.getElementById('dbSupabaseKey').value.trim();
    
    if (!url || !key) {
        showToast('Please provide both URL and Key to test.', 'warning');
        return;
    }
    
    showToast('Testing Supabase connection...', 'info');
    
    try {
        const testClient = window.supabase.createClient(url, key);
        // Attempt to fetch from violations table to check permissions
        const { data, error } = await testClient.from('violations').select('id').limit(1);
        
        if (error) {
            console.error('Test connection error:', error);
            showToast(`Connection failed: ${error.message}`, 'danger');
        } else {
            showToast('Connection Successful! Database structure matches.', 'success');
        }
    } catch (e) {
        console.error('Test connection exception:', e);
        showToast(`Connection failed: Check URL format.`, 'danger');
    }
}

// ==========================================
// 11. EVENT & RED FLAG MANAGEMENT MODULES
// ==========================================

function loadEventsList() {
    const search = document.getElementById('eventSearchInput').value.trim().toLowerCase();
    const cohort = document.getElementById('eventCohortFilter').value;
    const category = document.getElementById('eventCategoryFilter').value;

    const tbody = document.getElementById('eventsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const activeEvents = db.events.filter(e => !e.is_deleted);

    const filtered = activeEvents.filter(event => {
        if (search && !event.event_name.toLowerCase().includes(search)) return false;
        if (cohort && !event.cohort.toLowerCase().includes(cohort.toLowerCase())) return false;
        
        const catIds = event.violation_category_ids || (event.violation_category_id ? [event.violation_category_id] : []);
        const categories = catIds.map(id => db.violations.find(v => v.id === id)).filter(Boolean);
        if (category && !categories.some(c => c.category_name === category)) return false;

        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-muted);">No events found. Click "Create Event" to add one.</td></tr>`;
        return;
    }

    filtered.forEach(event => {
        const catIds = event.violation_category_ids || (event.violation_category_id ? [event.violation_category_id] : []);
        const categories = catIds.map(id => db.violations.find(v => v.id === id)).filter(Boolean);
        const categoryName = categories.map(c => c.category_name).join(', ') || 'No Categories';

        // Calculate counts
        const finedCount = db.fines.filter(f => f.event_id === event.id && !f.is_deleted).length;
        const registeredCount = db.eventAttendance.filter(a => a.event_id === event.id && a.attendance_status === 'ATTENDED').length;

        const cohortLabel = getCohortDisplayLabel(event.cohort);
        const badgeClass = event.cohort.includes(',') ? 'badge-closed' : (event.cohort === 'SUMMER_2026_27' ? 'badge-open' : 'badge-carried');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--color-primary); cursor: pointer;" onclick="manageEventDetails('${event.id}')">${event.event_name}</td>
            <td><span class="badge ${badgeClass}">${cohortLabel}</span></td>
            <td>${categoryName}</td>
            <td>${event.event_date || 'N/A'}</td>
            <td style="font-weight: 600; color: var(--color-danger);">${finedCount}</td>
            <td style="font-weight: 600; color: var(--color-success);">${registeredCount}</td>
            <td class="actions-cell">
                <div style="display: flex; gap: 8px; align-items: center; white-space: nowrap;">
                    <button class="btn btn-sm" style="display: inline-flex; align-items: center; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; padding: 6px 12px; font-weight: 500; cursor: pointer; border-radius: var(--radius-sm); transition: all 0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'" onclick="manageEventDetails('${event.id}')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px; vertical-align: middle;"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>Manage
                    </button>
                    <button class="btn btn-sm" style="display: inline-flex; align-items: center; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; padding: 6px 12px; font-weight: 500; cursor: pointer; border-radius: var(--radius-sm); transition: all 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'" onclick="deleteEvent('${event.id}')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px; vertical-align: middle;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function manageEventDetails(eventId) {
    currentSelectedEventId = eventId;
    currentEventDetailTab = 'FINED';
    switchView('manage-event');
}

async function deleteEvent(eventId) {
    if (!confirm('Are you sure you want to delete this event? This will also remove linked auto-fines.')) return;

    const event = db.events.find(e => e.id === eventId);
    if (!event) return;

    const timestamp = new Date().toISOString();
    event.is_deleted = true;
    event.updated_at = timestamp;

    // Delete linked fines
    const linkedFines = db.fines.filter(f => f.event_id === eventId);
    linkedFines.forEach(f => {
        f.is_deleted = true;
        f.updated_at = timestamp;
    });

    saveTable(DB_KEYS.EVENTS, db.events);
    saveTable(DB_KEYS.FINES, db.fines);

    if (supabaseClient) {
        try {
            await supabaseClient.from('events').update({ is_deleted: true, updated_at: timestamp }).eq('id', eventId);
            if (linkedFines.length > 0) {
                await supabaseClient.from('fines').update({ is_deleted: true, updated_at: timestamp }).eq('event_id', eventId);
            }
            
            // Log audit
            const actLog = {
                id: 'act-' + generateUUID(),
                action_type: 'EVENT_DELETED',
                entity_type: 'EVENT',
                entity_id: eventId,
                performed_by: getAdminName(),
                details: `Deleted event ${event.event_name} and soft-deleted all linked fines`,
                created_at: timestamp
            };
            await supabaseClient.from('action_log').insert(actLog);
            db.actionLog.push(actLog);
            saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);

            const audLog = {
                id: 'aud-' + generateUUID(),
                admin_username: getAdminName(),
                action_type: 'EVENT_DELETED',
                entity_affected: 'events',
                log_details: `Deleted event ${event.event_name} (ID: ${eventId})`,
                created_at: timestamp
            };
            await supabaseClient.from('audit_trail').insert(audLog);
            db.auditTrail.push(audLog);
            saveTable(DB_KEYS.AUDIT_TRAIL, db.auditTrail);

            showToast('Event deleted successfully!', 'success');
        } catch (e) {
            console.error('Delete event error:', e);
            showToast('Local database updated, but cloud deletion failed.', 'warning');
        }
    } else {
        const actLog = {
            id: 'act-' + generateUUID(),
            action_type: 'EVENT_DELETED',
            entity_type: 'EVENT',
            entity_id: eventId,
            performed_by: getAdminName(),
            details: `Deleted event ${event.event_name}`,
            created_at: timestamp
        };
        db.actionLog.push(actLog);
        saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
        showToast('Event deleted successfully!', 'success');
    }

    loadEventsList();
}

function populateViolationCategoriesForNewEvent() {
    if (db.violations.length === 0) {
        seedViolationCategories();
    }
    const checkedCohorts = Array.from(document.querySelectorAll('input[name="newEventCohort"]:checked')).map(cb => cb.value);
    const container = document.getElementById('newEventCategoriesContainer');
    const placeholder = document.getElementById('newEventCategoriesPlaceholder');
    const btn = document.getElementById('newEventCategoriesBtn');
    
    if (!container) return;

    // Track currently checked category IDs before rebuilding
    const checkedIds = Array.from(document.querySelectorAll('input[name="newEventCategories"]:checked')).map(cb => cb.value);

    container.innerHTML = '';

    if (checkedCohorts.length === 0) {
        if (btn) btn.style.display = 'none';
        const dropdown = document.getElementById('newEventCategoriesDropdown');
        if (dropdown) dropdown.style.display = 'none';
        if (placeholder) {
            placeholder.style.display = 'block';
            placeholder.innerText = 'Please select at least one cohort.';
        }
        return;
    }

    if (placeholder) placeholder.style.display = 'none';
    if (btn) btn.style.display = 'flex';

    checkedCohorts.forEach(cohort => {
        const cohortLabel = cohort === 'SUMMER_2026_27' ? 'Summer Internship Placements (SIP)' : 'Final Placements';
        const h4 = document.createElement('h4');
        h4.innerText = cohortLabel;
        h4.style.fontSize = '12px';
        h4.style.fontWeight = '600';
        h4.style.marginTop = '12px';
        h4.style.marginBottom = '6px';
        h4.style.color = 'var(--color-primary)';
        container.appendChild(h4);

        const matchingViolations = db.violations.filter(v => v.cohort === cohort);
        if (matchingViolations.length === 0) {
            const p = document.createElement('p');
            p.innerText = 'No violation categories found for this cohort.';
            p.style.fontSize = '12px';
            p.style.color = 'var(--color-text-muted)';
            container.appendChild(p);
        } else {
            matchingViolations.forEach(v => {
                const div = document.createElement('div');
                div.className = 'checkbox-list-item';
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.gap = '8px';
                div.style.padding = '4px 0';
                
                const isChecked = checkedIds.includes(v.id) ? 'checked' : '';
                div.innerHTML = `
                    <input type="checkbox" name="newEventCategories" id="cat_${v.id}" value="${v.id}" class="table-checkbox" data-cohort="${cohort}" ${isChecked} onchange="updateNewEventCategoriesBtnText()">
                    <label for="cat_${v.id}" style="cursor: pointer; font-size: 13px; flex-grow: 1; user-select: none;">
                        <span style="font-weight: 600;">${v.category_name}</span> 
                        <span style="color: var(--color-text-secondary); margin-left: 8px;">(Fee: ₹${v.monetary_penalty_amount || 0}, Flags: ${v.red_flag_count || 0})</span>
                    </label>
                `;
                container.appendChild(div);
            });
        }
    });

    updateNewEventCategoriesBtnText();
}

function toggleNewEventCategoriesDropdown() {
    const dropdown = document.getElementById('newEventCategoriesDropdown');
    if (dropdown) {
        const isHidden = dropdown.style.display === 'none';
        dropdown.style.display = isHidden ? 'block' : 'none';
    }
}

function closeNewEventCategoriesDropdown() {
    const dropdown = document.getElementById('newEventCategoriesDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

// Add event listener to close dropdown on click outside
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('newEventCategoriesDropdown');
    const btn = document.getElementById('newEventCategoriesBtn');
    if (dropdown && btn && dropdown.style.display !== 'none') {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    }
});

function updateNewEventCategoriesBtnText() {
    const checkedBoxes = document.querySelectorAll('input[name="newEventCategories"]:checked');
    const btnText = document.getElementById('newEventCategoriesBtnText');
    if (btnText) {
        if (checkedBoxes.length === 0) {
            btnText.innerText = "Select Categories...";
        } else {
            btnText.innerText = `${checkedBoxes.length} selected`;
        }
    }
}

function addNewEventCustomCategory() {
    const customName = document.getElementById('newEventCustomCatName').value.trim();
    const amountValInput = document.getElementById('newEventCustomCatAmount');
    const flagsValInput = document.getElementById('newEventCustomCatFlags');
    const cohortSelect = document.getElementById('newEventCustomCatCohort');

    if (!customName) {
        showToast('Please enter a custom category name.', 'warning');
        return;
    }

    const amountVal = parseFloat(amountValInput.value) || 0;
    const flagsVal = parseInt(flagsValInput.value) || 0;
    const cohortVal = cohortSelect.value;

    if (amountVal < 0) {
        showToast('Fine amount must be positive.', 'warning');
        return;
    }
    if (flagsVal < 0 || flagsVal > 3) {
        showToast('Red flags must be between 0 and 3.', 'warning');
        return;
    }

    const newCatId = 'violation-' + generateUUID();
    const newCat = {
        id: newCatId,
        category_name: customName,
        parent_category: 'Custom Overrides',
        cohort: cohortVal,
        monetary_penalty_amount: amountVal,
        red_flag_count: flagsVal,
        combination_type: (amountVal > 0 && flagsVal > 0) ? 'BOTH' : (flagsVal > 0 ? 'RED_FLAG_ONLY' : 'MONETARY_ONLY'),
        description: 'Custom category created during event setup'
    };

    db.violations.push(newCat);
    saveTable(DB_KEYS.VIOLATIONS, db.violations);

    if (supabaseClient) {
        pushToCloud('violations', newCat);
    }

    // Refresh the category list to display the newly added option
    populateViolationCategoriesForNewEvent();

    // Check the new checkbox automatically
    const checkbox = document.getElementById(`cat_${newCatId}`);
    if (checkbox) {
        checkbox.checked = true;
    }

    // Update selection count
    updateNewEventCategoriesBtnText();

    // Reset custom inputs
    document.getElementById('newEventCustomCatName').value = '';
    amountValInput.value = '';
    flagsValInput.value = '';

    showToast(`Added custom category "${customName}" successfully!`, 'success');
}

async function handleCreateEventSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('newEventName').value.trim();
    const date = document.getElementById('newEventDate').value;
    const desc = document.getElementById('newEventDescription').value.trim();

    const checkedCohorts = Array.from(document.querySelectorAll('input[name="newEventCohort"]:checked')).map(cb => cb.value);
    const checkedBoxes = document.querySelectorAll('input[name="newEventCategories"]:checked');

    if (!name || checkedCohorts.length === 0) {
        showToast('Please select at least one cohort and fill in the event name.', 'warning');
        return;
    }

    const timestamp = new Date().toISOString();
    const eventId = 'evt-' + generateUUID();
    const cohortVal = checkedCohorts.join(', ');
    const categoryIds = Array.from(checkedBoxes).map(cb => cb.value);

    const newEvent = {
        id: eventId,
        event_name: name,
        cohort: cohortVal,
        violation_category_ids: categoryIds,
        event_date: date,
        description: desc,
        created_at: timestamp,
        updated_at: timestamp,
        is_active: true,
        is_deleted: false
    };

    db.events.push(newEvent);
    saveTable(DB_KEYS.EVENTS, db.events);

    const newEVCs = [];
    categoryIds.forEach(catId => {
        const evc = {
            id: 'evc-' + generateUUID(),
            event_id: eventId,
            violation_category_id: catId,
            added_date: timestamp
        };
        db.eventViolationCategories.push(evc);
        newEVCs.push(evc);
    });
    saveTable(DB_KEYS.EVENT_VIOLATION_CATEGORIES, db.eventViolationCategories);

    const actLog = {
        id: 'act-' + generateUUID(),
        action_type: 'EVENT_CREATED',
        entity_type: 'EVENT',
        entity_id: eventId,
        performed_by: getAdminName(),
        details: `Created placement event ${name} for cohorts ${cohortVal} with ${categoryIds.length} categories`,
        created_at: timestamp
    };
    db.actionLog.push(actLog);
    saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);

    const audLog = {
        id: 'aud-' + generateUUID(),
        admin_username: getAdminName(),
        action_type: 'EVENT_CREATED',
        entity_affected: 'events',
        log_details: `Created placement event ${name} (ID: ${eventId}) for cohorts ${cohortVal}`,
        created_at: timestamp
    };
    db.auditTrail.push(audLog);
    saveTable(DB_KEYS.AUDIT_TRAIL, db.auditTrail);

    if (supabaseClient) {
        try {
            await supabaseClient.from('events').insert(newEvent);
            if (newEVCs.length > 0) {
                await supabaseClient.from('event_violation_categories').upsert(newEVCs);
            }
            await supabaseClient.from('action_log').insert(actLog);
            await supabaseClient.from('audit_trail').insert(audLog);
        } catch (err) {
            console.error('Supabase create event error:', err);
            showToast('Saved locally, cloud sync error.', 'warning');
        }
    }

    const successMsg = `<strong>Success!</strong> Event <strong>"${name}"</strong> has been created successfully for selected cohorts.`;
    const banner = document.getElementById('eventsSuccessBanner');
    if (banner) {
        banner.innerHTML = successMsg;
        banner.style.display = 'block';
        setTimeout(() => { banner.style.display = 'none'; }, 8000);
    }
    showToast(`Event "${name}" created successfully!`, 'success');

    // Reset Form
    document.getElementById('createEventForm').reset();
    populateViolationCategoriesForNewEvent();
    closeModal('createEventModal');
    loadEventsList();
}

function populateEditEventCategoriesList(eventId, checkedIds = null) {
    if (db.violations.length === 0) {
        seedViolationCategories();
    }

    const event = db.events.find(e => e.id === eventId);
    if (!event) return;
    
    const container = document.getElementById('editEventCategoriesContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Find existing checked category ids
    if (!checkedIds) {
        const linkedEVCs = db.eventViolationCategories.filter(evc => evc.event_id === event.id);
        checkedIds = new Set(linkedEVCs.map(evc => evc.violation_category_id));
        if (checkedIds.size === 0 && event.violation_category_id) {
            checkedIds.add(event.violation_category_id);
        }
    }
    
    const eventCohorts = event.cohort.split(',').map(c => c.trim().toLowerCase());
    const matchingViolations = db.violations.filter(v => {
        return eventCohorts.some(ec => {
            const ecClean = ec.toLowerCase();
            const vcClean = v.cohort.toLowerCase();
            return vcClean === ecClean || 
                   vcClean.includes(ecClean) || 
                   ecClean.includes(vcClean) ||
                   (vcClean.startsWith('summer') && ecClean.includes('summer')) ||
                   (vcClean.startsWith('final') && ecClean.includes('final'));
        });
    });
    
    matchingViolations.forEach(v => {
        const isChecked = checkedIds.has(v.id);
        const div = document.createElement('div');
        div.className = 'checkbox-list-item';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '8px';
        div.style.padding = '4px 0';
        div.innerHTML = `
            <input type="checkbox" name="editEventCategories" id="edit_cat_${v.id}" value="${v.id}" class="table-checkbox" ${isChecked ? 'checked' : ''}>
            <label for="edit_cat_${v.id}" style="cursor: pointer; font-size: 13px; flex-grow: 1; user-select: none;">
                <span style="font-weight: 600;">${v.category_name}</span> 
                <span style="color: var(--color-text-secondary); margin-left: 8px;">(Fee: ₹${v.monetary_penalty_amount || 0}, Flags: ${v.red_flag_count || 0})</span>
            </label>
        `;
        container.appendChild(div);
    });
}

async function addEditEventCustomCategory() {
    const customName = document.getElementById('editEventCustomCatName').value.trim();
    const customAmount = parseFloat(document.getElementById('editEventCustomCatAmount').value) || 0;
    const customFlags = parseInt(document.getElementById('editEventCustomCatFlags').value) || 0;
    const customCohort = document.getElementById('editEventCustomCatCohort').value;

    if (!customName) {
        showToast('Please enter a category name.', 'warning');
        return;
    }

    const newCat = {
        id: 'cat-' + generateUUID(),
        category_name: customName,
        parent_category: 'Event-Specific Custom Category',
        cohort: customCohort,
        monetary_penalty_amount: customAmount,
        red_flag_count: customFlags,
        combination_type: (customAmount > 0 && customFlags > 0) ? 'BOTH' : (customFlags > 0 ? 'RED_FLAG_ONLY' : 'MONETARY_ONLY'),
        description: 'Custom added category for event editing.'
    };

    db.violations.push(newCat);
    saveTable(DB_KEYS.VIOLATIONS, db.violations);

    if (supabaseClient) {
        try {
            await supabaseClient.from('violations').insert({
                id: newCat.id,
                category_name: newCat.category_name,
                parent_category: newCat.parent_category,
                cohort: newCat.cohort,
                monetary_penalty_amount: newCat.monetary_penalty_amount,
                red_flag_count: newCat.red_flag_count
            });
        } catch (e) {
            console.error('Supabase custom category insert error:', e);
        }
    }

    // Capture currently checked boxes in the edit modal
    const checked = new Set(Array.from(document.querySelectorAll('input[name="editEventCategories"]:checked')).map(cb => cb.value));
    // Check the new category by default
    checked.add(newCat.id);

    const eventId = document.getElementById('editEventId').value;
    // Re-render checklist
    populateEditEventCategoriesList(eventId, checked);

    // Reset inputs
    document.getElementById('editEventCustomCatName').value = '';
    document.getElementById('editEventCustomCatAmount').value = '';
    document.getElementById('editEventCustomCatFlags').value = '';

    showToast(`Added custom category "${customName}" successfully!`, 'success');
}

function openEditEventModal() {
    const event = db.events.find(e => e.id === currentSelectedEventId && !e.is_deleted);
    if (!event) {
        showToast('Selected event not found.', 'danger');
        return;
    }

    document.getElementById('editEventId').value = event.id;
    document.getElementById('editEventName').value = event.event_name;
    
    let displayCohort = getCohortDisplayLabel(event.cohort);
    document.getElementById('editEventCohort').value = displayCohort;
    document.getElementById('editEventDate').value = event.event_date || '';
    document.getElementById('editEventDescription').value = event.description || '';

    // Populate categories checklist
    populateEditEventCategoriesList(event.id);

    openModal('editEventModal');
}

async function handleEditEventSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('editEventId').value;
    const date = document.getElementById('editEventDate').value;
    const desc = document.getElementById('editEventDescription').value.trim();

    const event = db.events.find(ev => ev.id === id && !ev.is_deleted);
    if (!event) return;

    const checkedBoxes = document.querySelectorAll('input[name="editEventCategories"]:checked');
    const categoryIds = Array.from(checkedBoxes).map(cb => cb.value);

    event.event_date = date;
    event.description = desc;
    event.violation_category_ids = categoryIds;
    event.updated_at = new Date().toISOString();

    saveTable(DB_KEYS.EVENTS, db.events);

    // Update join table mapping
    // Remove old join table mappings for this event
    db.eventViolationCategories = db.eventViolationCategories.filter(evc => evc.event_id !== id);
    
    // Add new mappings
    categoryIds.forEach(catId => {
        db.eventViolationCategories.push({
            id: 'evc-' + generateUUID(),
            event_id: id,
            violation_category_id: catId,
            added_date: new Date().toISOString()
        });
    });
    saveTable(DB_KEYS.EVENT_VIOLATION_CATEGORIES, db.eventViolationCategories);

    if (supabaseClient) {
        try {
            await supabaseClient.from('events').update({
                event_date: date,
                description: desc,
                violation_category_ids: categoryIds,
                updated_at: event.updated_at
            }).eq('id', id);

            // Clean & insert new categories
            await supabaseClient.from('event_violation_categories').delete().eq('event_id', id);
            if (categoryIds.length > 0) {
                const supabaseJoinRows = db.eventViolationCategories.filter(r => r.event_id === id);
                await supabaseClient.from('event_violation_categories').insert(supabaseJoinRows);
            }

            const actLog = {
                id: 'act-' + generateUUID(),
                action_type: 'EVENT_EDITED',
                entity_type: 'EVENT',
                entity_id: id,
                performed_by: getAdminName(),
                details: `Edited event ${event.event_name} details and updated categories list`,
                created_at: new Date().toISOString()
            };
            await supabaseClient.from('action_log').insert(actLog);
            db.actionLog.push(actLog);
            saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
            
            showToast('Event updated successfully!', 'success');
        } catch (err) {
            console.error('Supabase edit event error:', err);
            showToast('Saved locally, cloud sync error.', 'warning');
        }
    } else {
        const actLog = {
            id: 'act-' + generateUUID(),
            action_type: 'EVENT_EDITED',
            entity_type: 'EVENT',
            entity_id: id,
            performed_by: getAdminName(),
            details: `Edited event ${event.event_name} details locally`,
            created_at: new Date().toISOString()
        };
        db.actionLog.push(actLog);
        saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
        showToast('Event updated successfully!', 'success');
    }

    closeModal('editEventModal');
    loadEventDetailView();
}

let selectedEventFinesForBulk = new Set();

function switchEventDetailTab(tab) {
    currentEventDetailTab = tab;
    
    document.getElementById('eventDetailTabRegistered').classList.toggle('active', tab === 'REGISTERED');
    document.getElementById('eventDetailTabFined').classList.toggle('active', tab === 'FINED');
    document.getElementById('eventDetailTabPaid').classList.toggle('active', tab === 'PAID_FINE');
    document.getElementById('eventDetailTabClosed').classList.toggle('active', tab === 'CLOSED');
    
    selectedEventFinesForBulk.clear();
    const chkSelectAll = document.getElementById('selectAllEventFinesCheckbox');
    if (chkSelectAll) chkSelectAll.checked = false;
    updateEventDetailBulkActionsBar();

    const actionsContainer = document.getElementById('eventDetailTabActionsContainer');
    if (actionsContainer) {
        actionsContainer.innerHTML = '';
        let exportBtnHtml = `
            <button class="btn btn-sm btn-outline" onclick="exportEventTabFilteredData('${tab}')" style="display: inline-flex; align-items: center; gap: 4px; border-color: var(--color-primary); color: var(--color-primary);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>Export Tab Data</span>
            </button>
        `;
        if (tab === 'FINED') {
            actionsContainer.innerHTML = `
                <button class="btn btn-sm btn-primary" onclick="openAddEventFineManualModal()" style="display: inline-flex; align-items: center; gap: 4px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span>Add Fine Manually</span>
                </button>
                <button class="btn btn-sm btn-outline" onclick="openUploadViolationsModal()" style="display: inline-flex; align-items: center; gap: 4px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <span>Upload Violations</span>
                </button>
                ${exportBtnHtml}
            `;
        } else {
            actionsContainer.innerHTML = exportBtnHtml;
        }
    }

    loadEventDetailView();
}

function loadEventDetailView() {
    const event = db.events.find(e => e.id === currentSelectedEventId && !e.is_deleted);
    if (!event) {
        showToast('Selected event not found.', 'danger');
        switchView('events');
        return;
    }

    // Populate header details
    document.getElementById('eventDetailName').innerText = event.event_name;
    let displayCohort = getCohortDisplayLabel(event.cohort);
    document.getElementById('eventDetailCohort').innerText = displayCohort;
    document.getElementById('eventDetailDate').innerText = event.event_date || 'N/A';
    
    // Fetch and display linked categories from join table
    const linkedEVCs = db.eventViolationCategories.filter(evc => evc.event_id === event.id);
    const categoryNames = linkedEVCs.map(evc => {
        const cat = db.violations.find(v => v.id === evc.violation_category_id);
        return cat ? cat.category_name : null;
    }).filter(name => name !== null);

    if (categoryNames.length === 0 && event.violation_category_id) {
        const cat = db.violations.find(v => v.id === event.violation_category_id);
        if (cat) categoryNames.push(cat.category_name);
    }

    document.getElementById('eventDetailCategory').innerText = categoryNames.length > 0 ? categoryNames.join(', ') : 'N/A';

    // Populate Category Filter dropdown dynamically if it is empty or active event changes
    const categoryFilter = document.getElementById('eventDetailCategoryFilter');
    if (categoryFilter) {
        const previousVal = categoryFilter.value;
        const linkedEVCs = db.eventViolationCategories.filter(evc => evc.event_id === event.id);
        const categories = linkedEVCs.map(evc => db.violations.find(v => v.id === evc.violation_category_id)).filter(Boolean);
        
        const uniqueCategories = [];
        const seen = new Set();
        categories.forEach(c => {
            if (!seen.has(c.category_name)) {
                seen.add(c.category_name);
                uniqueCategories.push(c);
            }
        });

        const currentOptionValues = Array.from(categoryFilter.options).map(o => o.value).filter(v => v !== "");
        const newOptionValues = uniqueCategories.map(c => c.id);
        
        if (JSON.stringify(currentOptionValues.sort()) !== JSON.stringify(newOptionValues.sort())) {
            categoryFilter.innerHTML = '<option value="">All Categories</option>';
            uniqueCategories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.innerText = cat.category_name;
                categoryFilter.appendChild(opt);
            });
            if (newOptionValues.includes(previousVal)) {
                categoryFilter.value = previousVal;
            }
        }
    }

    // Calculate Counts for Tab Badges
    const eventFines = db.fines.filter(f => f.event_id === event.id && !f.is_deleted);
    const registeredCount = db.eventAttendance.filter(a => a.event_id === event.id && a.attendance_status === 'ATTENDED').length;
    const finedOpenCount = eventFines.filter(f => f.status === 'OPEN').length;
    const paidCount = eventFines.filter(f => f.status === 'PROOF_SUBMITTED').length;
    const closedCount = eventFines.filter(f => f.status === 'CLOSED').length;

    document.getElementById('eventDetailRegisteredBadge').innerText = registeredCount;
    document.getElementById('eventDetailFinedBadge').innerText = finedOpenCount;
    document.getElementById('eventDetailPaidBadge').innerText = paidCount;
    document.getElementById('eventDetailClosedBadge').innerText = closedCount;

    // Filters & Search
    const search = document.getElementById('eventDetailSearchInput').value.trim().toLowerCase();
    const cohortFilterVal = document.getElementById('eventDetailCohortFilter') ? document.getElementById('eventDetailCohortFilter').value : '';
    const categoryFilterVal = document.getElementById('eventDetailCategoryFilter') ? document.getElementById('eventDetailCategoryFilter').value : '';

    const tableHead = document.getElementById('eventDetailTableHead');
    const tableBody = document.getElementById('eventDetailTableBody');
    if (!tableHead || !tableBody) return;
    tableBody.innerHTML = '';

    if (currentEventDetailTab === 'REGISTERED') {
        tableHead.innerHTML = `
            <tr>
                <th>Student Name</th>
                <th>Roll Number</th>
                <th>Email ID</th>
                <th>Registered Date/Time</th>
                <th>Status</th>
                <th>Actions</th>
            </tr>
        `;

        const registeredStudents = db.eventAttendance.filter(a => a.event_id === event.id && a.attendance_status === 'ATTENDED').map(a => {
            const student = db.students.find(s => s.id === a.student_id);
            return {
                ...a,
                studentName: student ? student.name : 'Unknown Student',
                rollNumber: student ? student.roll_number : 'N/A',
                emailId: student ? student.email_id : 'N/A',
                cohort: student ? student.cohort : 'N/A'
            };
        }).filter(item => {
            if (search && !item.studentName.toLowerCase().includes(search) && !item.rollNumber.toLowerCase().includes(search)) return false;
            if (cohortFilterVal && item.cohort !== cohortFilterVal) return false;
            return true;
        });

        if (registeredStudents.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted);">No registered/attended students found.</td></tr>`;
            return;
        }

        registeredStudents.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 600;">${item.studentName}</td>
                <td style="font-family: monospace; font-size: 13px;">${item.rollNumber}</td>
                <td>${item.emailId}</td>
                <td>${item.attended_date_time || 'N/A'}</td>
                <td><span class="badge badge-closed">Registered</span></td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="openMarkAsFinedModal('${item.student_id}', '${item.id}')">Mark as Fined</button>
                    <button class="btn btn-outline btn-sm" style="color: var(--color-danger); border-color: rgba(239,68,68,0.2);" onclick="removeAttendanceRecord('${item.id}')">Remove</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

    } else if (currentEventDetailTab === 'FINED') {
        tableHead.innerHTML = `
            <tr>
                <th class="checkbox-cell" style="width: 40px;">
                    <input type="checkbox" id="selectAllEventFinesCheckbox" onchange="toggleSelectAllEventFines(this)">
                </th>
                <th>Student Name</th>
                <th>Roll Number</th>
                <th>Violation Category</th>
                <th>Monetary Fine</th>
                <th>Red Flags</th>
                <th>Status</th>
                <th>Actions</th>
            </tr>
        `;

        const filteredFines = eventFines.filter(f => f.status === 'OPEN').map(fine => {
            const student = db.students.find(s => s.id === fine.student_id);
            const cat = db.violations.find(v => v.id === fine.violation_category_id);
            return {
                ...fine,
                studentName: student ? student.name : 'Unknown Student',
                rollNumber: student ? student.roll_number : 'N/A',
                emailId: student ? student.email_id : 'N/A',
                categoryName: cat ? cat.category_name : 'Direct / Custom',
                studentCohort: student ? student.cohort : 'N/A'
            };
        }).filter(fine => {
            if (search && !fine.studentName.toLowerCase().includes(search) && !fine.rollNumber.toLowerCase().includes(search)) return false;
            if (cohortFilterVal && fine.studentCohort !== cohortFilterVal) return false;
            if (categoryFilterVal && fine.violation_category_id !== categoryFilterVal) return false;
            return true;
        });

        if (filteredFines.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--color-text-muted);">No open fines found matching filter criteria.</td></tr>`;
            return;
        }

        filteredFines.forEach(fine => {
            const isChecked = selectedEventFinesForBulk.has(fine.id) ? 'checked' : '';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="checkbox-cell">
                    <input type="checkbox" class="table-checkbox event-fine-checkbox" value="${fine.id}" ${isChecked} onchange="handleEventFineCheckboxChange(this)">
                </td>
                <td style="font-weight: 600;">${fine.studentName}</td>
                <td style="font-family: monospace; font-size: 13px;">${fine.rollNumber}</td>
                <td>${fine.categoryName}</td>
                <td style="font-weight: 600;">${formatINR(fine.monetary_penalty_amount)}</td>
                <td style="text-align: center;"><span class="red-flags-count-badge ${fine.red_flags === 0 ? 'zero' : ''}">${fine.red_flags}</span></td>
                <td><span class="badge badge-open">Open</span></td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="markFineAsPaid('${fine.id}')">Mark as Paid</button>
                    <button class="btn btn-outline btn-sm" onclick="openEditFineModal('${fine.id}')">Edit</button>
                    <button class="btn btn-outline btn-sm" style="color: var(--color-danger); border-color: rgba(239,68,68,0.2);" onclick="deleteIndividualEventFine('${fine.id}')">Delete</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

    } else if (currentEventDetailTab === 'PAID_FINE') {
        tableHead.innerHTML = `
            <tr>
                <th class="checkbox-cell" style="width: 40px;">
                    <input type="checkbox" id="selectAllEventFinesCheckbox" onchange="toggleSelectAllEventFines(this)">
                </th>
                <th>Student Name</th>
                <th>Roll Number</th>
                <th>Violation Category</th>
                <th>Monetary Fine</th>
                <th>Red Flags</th>
                <th>Status</th>
                <th>Actions</th>
            </tr>
        `;

        const filteredFines = eventFines.filter(f => f.status === 'PROOF_SUBMITTED').map(fine => {
            const student = db.students.find(s => s.id === fine.student_id);
            const cat = db.violations.find(v => v.id === fine.violation_category_id);
            return {
                ...fine,
                studentName: student ? student.name : 'Unknown Student',
                rollNumber: student ? student.roll_number : 'N/A',
                emailId: student ? student.email_id : 'N/A',
                categoryName: cat ? cat.category_name : 'Direct / Custom',
                studentCohort: student ? student.cohort : 'N/A'
            };
        }).filter(fine => {
            if (search && !fine.studentName.toLowerCase().includes(search) && !fine.rollNumber.toLowerCase().includes(search)) return false;
            if (cohortFilterVal && fine.studentCohort !== cohortFilterVal) return false;
            if (categoryFilterVal && fine.violation_category_id !== categoryFilterVal) return false;
            return true;
        });

        if (filteredFines.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--color-text-muted);">No paid fines with submitted proofs found.</td></tr>`;
            return;
        }

        filteredFines.forEach(fine => {
            const isChecked = selectedEventFinesForBulk.has(fine.id) ? 'checked' : '';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="checkbox-cell">
                    <input type="checkbox" class="table-checkbox event-fine-checkbox" value="${fine.id}" ${isChecked} onchange="handleEventFineCheckboxChange(this)">
                </td>
                <td style="font-weight: 600;">${fine.studentName}</td>
                <td style="font-family: monospace; font-size: 13px;">${fine.rollNumber}</td>
                <td>${fine.categoryName}</td>
                <td style="font-weight: 600;">${formatINR(fine.monetary_penalty_amount)}</td>
                <td style="text-align: center;"><span class="red-flags-count-badge ${fine.red_flags === 0 ? 'zero' : ''}">${fine.red_flags}</span></td>
                <td><span class="badge badge-proof">Proof Submitted</span></td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="openCloseFineModal('${fine.id}')">Close Fine</button>
                    <button class="btn btn-outline btn-sm" onclick="rejectFineProof('${fine.id}')">Reject Proof</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

    } else if (currentEventDetailTab === 'CLOSED') {
        tableHead.innerHTML = `
            <tr>
                <th>Student Name</th>
                <th>Roll Number</th>
                <th>Violation Category</th>
                <th>Monetary Fine</th>
                <th>Red Flags</th>
                <th>Closure Info</th>
                <th>Actions</th>
            </tr>
        `;

        const filteredFines = eventFines.filter(f => f.status === 'CLOSED').map(fine => {
            const student = db.students.find(s => s.id === fine.student_id);
            const cat = db.violations.find(v => v.id === fine.violation_category_id);
            return {
                ...fine,
                studentName: student ? student.name : 'Unknown Student',
                rollNumber: student ? student.roll_number : 'N/A',
                emailId: student ? student.email_id : 'N/A',
                categoryName: cat ? cat.category_name : 'Direct / Custom',
                studentCohort: student ? student.cohort : 'N/A'
            };
        }).filter(fine => {
            if (search && !fine.studentName.toLowerCase().includes(search) && !fine.rollNumber.toLowerCase().includes(search)) return false;
            if (cohortFilterVal && fine.studentCohort !== cohortFilterVal) return false;
            if (categoryFilterVal && fine.violation_category_id !== categoryFilterVal) return false;
            return true;
        });

        if (filteredFines.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-muted);">No closed fines found.</td></tr>`;
            return;
        }

        filteredFines.forEach(fine => {
            const closureDetails = `<strong>${fine.closure_reason || 'Resolved'}</strong>${fine.closure_notes ? `: ${fine.closure_notes}` : ''}`;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 600;">${fine.studentName}</td>
                <td style="font-family: monospace; font-size: 13px;">${fine.rollNumber}</td>
                <td>${fine.categoryName}</td>
                <td style="font-weight: 600;">${formatINR(fine.monetary_penalty_amount)}</td>
                <td style="text-align: center;"><span class="red-flags-count-badge ${fine.red_flags === 0 ? 'zero' : ''}">${fine.red_flags}</span></td>
                <td style="font-size: 13px; color: var(--color-text-secondary);">${closureDetails}</td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="reopenFine('${fine.id}')">Reopen</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }
}

function openUploadAttendanceModal() {
    attendanceImportBatch = [];
    document.getElementById('attendanceFileInput').value = '';
    document.getElementById('attendancePreviewContainer').style.display = 'none';
    document.getElementById('btnConfirmAttendanceUpload').disabled = true;

    const absenceSelect = document.getElementById('attendanceAbsenceCategorySelect');
    if (absenceSelect) {
        absenceSelect.innerHTML = '<option value="" disabled selected>Select Absence Violation Category</option>';
        
        const event = db.events.find(e => e.id === currentSelectedEventId);
        if (event) {
            const linkedEVCs = db.eventViolationCategories.filter(evc => evc.event_id === event.id);
            const catIds = linkedEVCs.map(evc => evc.violation_category_id);
            if (catIds.length === 0 && event.violation_category_id) {
                catIds.push(event.violation_category_id);
            }

            const categories = db.violations.filter(v => catIds.includes(v.id));
            categories.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.innerText = `${v.category_name} (₹${v.monetary_penalty_amount || 0}, Flags: ${v.red_flag_count || 0})`;
                
                const nameLower = v.category_name.toLowerCase();
                if (nameLower.includes('absent') || nameLower.includes('absence') || nameLower.includes('missing') || nameLower.includes('attendance')) {
                    opt.selected = true;
                }
                absenceSelect.appendChild(opt);
            });
        }
    }

    openModal('uploadAttendanceModal');
}

function openUploadEventProofModal() {
    eventProofImportBatch = [];
    document.getElementById('eventProofFileInput').value = '';
    document.getElementById('eventProofPreviewContainer').style.display = 'none';
    document.getElementById('btnConfirmEventProofUpload').disabled = true;
    openModal('uploadEventProofModal');
}

function toggleSelectAllEventFines(chkAll) {
    selectedEventFinesForBulk.clear();
    const chkboxes = document.querySelectorAll('.event-fine-checkbox');
    chkboxes.forEach(chk => {
        chk.checked = chkAll.checked;
        if (chkAll.checked) {
            selectedEventFinesForBulk.add(chk.value);
        }
    });
    updateEventDetailBulkActionsBar();
}

function handleEventFineCheckboxChange(chk) {
    if (chk.checked) {
        selectedEventFinesForBulk.add(chk.value);
    } else {
        selectedEventFinesForBulk.delete(chk.value);
    }
    
    const chkAll = document.getElementById('selectAllEventFinesCheckbox');
    const chkboxes = document.querySelectorAll('.event-fine-checkbox');
    if (chkAll) {
        chkAll.checked = selectedEventFinesForBulk.size === chkboxes.length && chkboxes.length > 0;
    }
    updateEventDetailBulkActionsBar();
}

function updateEventDetailBulkActionsBar() {
    const bar = document.getElementById('eventDetailBulkActions');
    if (!bar) return;

    if (selectedEventFinesForBulk.size > 0 && currentEventDetailTab === 'FINED') {
        bar.style.display = 'flex';
        document.getElementById('eventDetailSelectedCount').innerText = selectedEventFinesForBulk.size;
    } else {
        bar.style.display = 'none';
    }
}

let attendanceImportBatch = [];
let lastAttendanceCSVContent = '';

function updateAttendanceUploadText() {
    const uploadType = document.querySelector('input[name="attendanceUploadType"]:checked')?.value || 'present';
    const hint = document.getElementById('attendanceFormatHint');
    const dropzoneText = document.getElementById('attendanceDropzoneText');
    
    if (uploadType === 'present') {
        if (hint) hint.innerHTML = 'Name, Roll Number, Email ID, Date/Time Attended (optional)';
        if (dropzoneText) dropzoneText.innerText = 'Drag and drop your attendance CSV or Excel file here, or click to browse';
    } else {
        if (hint) hint.innerHTML = 'Name, Roll Number, Email ID';
        if (dropzoneText) dropzoneText.innerText = 'Drag and drop your absent students CSV or Excel file here, or click to browse';
    }

    if (lastAttendanceCSVContent) {
        handleAttendanceCSVParsed(lastAttendanceCSVContent);
    }
}

function handleAttendanceCSVParsed(csvContent) {
    lastAttendanceCSVContent = csvContent;
    const rows = parseCSVContent(csvContent);
    if (rows.length < 2) {
        showToast('Empty or invalid CSV file.', 'danger');
        return;
    }

    const uploadType = document.querySelector('input[name="attendanceUploadType"]:checked')?.value || 'present';

    attendanceImportBatch = [];
    const previewBody = document.getElementById('attendancePreviewBody');
    if (!previewBody) return;
    previewBody.innerHTML = '';

    const event = db.events.find(e => e.id === currentSelectedEventId);
    if (!event) {
        showToast('No active event selected.', 'danger');
        return;
    }

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const rollIndex = headers.indexOf('roll number');
    const nameIndex = headers.indexOf('name');
    const emailIndex = headers.indexOf('email id');
    const timeIndex = headers.indexOf('date/time attended');

    if (rollIndex === -1) {
        showToast('Roll Number column is required in the CSV.', 'danger');
        return;
    }

    const siblingEvents = db.events.filter(e => e.event_name.trim().toLowerCase() === event.event_name.trim().toLowerCase() && !e.is_deleted);
    const siblingCohorts = siblingEvents.map(e => e.cohort.toLowerCase());

    const seenRolls = new Set();

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2 || !row[rollIndex]) continue;

        const roll = row[rollIndex].trim().toUpperCase();
        let name = nameIndex !== -1 && row[nameIndex] ? row[nameIndex].trim() : '';
        let email = emailIndex !== -1 && row[emailIndex] ? row[emailIndex].trim() : '';
        const attendedTime = timeIndex !== -1 && row[timeIndex] ? row[timeIndex].trim() : new Date().toLocaleString();

        const student = db.students.find(s => s.roll_number.toUpperCase() === roll && !s.is_deleted);
        
        let validationStatus = uploadType === 'present' ? 'Valid (Will Attend)' : 'Valid (Will Fine)';
        let isValid = true;
        let warningClass = '';

        if (seenRolls.has(roll)) {
            validationStatus = 'Duplicate roll number in upload batch (ignored).';
            isValid = false;
            warningClass = 'badge-carried';
        } else if (!student) {
            validationStatus = 'Roll Number not found in Master Registry.';
            isValid = false;
            warningClass = 'badge-deleted';
        } else {
            // Auto-resolve Name and Email from Master Student database
            name = student.name;
            email = student.email_id || email;

            if (student.cohort.toLowerCase() !== event.cohort.toLowerCase()) {
                const targetCohortLower = student.cohort.toLowerCase();
                if (targetCohortLower === 'summer_2026_27' || targetCohortLower === 'final_2026_27') {
                    validationStatus = uploadType === 'present' 
                        ? `Valid (Will Attend Sibling Event: ${student.cohort === 'SUMMER_2026_27' ? 'Summers' : 'Finals'})`
                        : `Valid (Will Fine Sibling Event: ${student.cohort === 'SUMMER_2026_27' ? 'Summers' : 'Finals'})`;
                    isValid = true;
                    warningClass = 'badge-closed';
                } else {
                    validationStatus = `Warning: Cohort mismatch (Student has ${student.cohort}, Event has ${event.cohort})`;
                    isValid = false;
                    warningClass = 'badge-carried';
                }
            }
        }

        if (isValid) {
            seenRolls.add(roll);
        }

        attendanceImportBatch.push({
            roll,
            name,
            email,
            attendedTime,
            studentId: student ? student.id : null,
            isValid
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${name || 'Unknown'}</td>
            <td style="font-family: monospace;">${roll}</td>
            <td>${email || 'N/A'}</td>
            <td><span class="badge ${warningClass ? warningClass : 'badge-closed'}">${validationStatus}</span></td>
        `;
        previewBody.appendChild(tr);
    }

    document.getElementById('attendancePreviewCount').innerText = attendanceImportBatch.length;
    document.getElementById('attendancePreviewContainer').style.display = 'block';
    
    document.getElementById('btnConfirmAttendanceUpload').disabled = attendanceImportBatch.length === 0;
}

async function executeAttendanceImport() {
    if (attendanceImportBatch.length === 0) return;

    const event = db.events.find(e => e.id === currentSelectedEventId);
    if (!event) return;

    const absenceCatId = document.getElementById('attendanceAbsenceCategorySelect').value;
    if (!absenceCatId) {
        showToast('Please select a violation category for absent students.', 'warning');
        return;
    }

    const uploadType = document.querySelector('input[name="attendanceUploadType"]:checked')?.value || 'present';

    if (uploadType === 'present') {
        showToast('Processing attendance sheet and auto-fines...', 'info');
    } else {
        showToast('Processing absent student list and auto-fines...', 'info');
    }

    let attendedCount = 0;
    let absentFinedCount = 0;

    const newFines = [];
    const newAttendance = [];

    // Parse cohorts linked to this single event
    const eventCohorts = event.cohort.split(',').map(c => c.trim().toLowerCase());
    const cohortStudents = db.students.filter(s => eventCohorts.includes(s.cohort.toLowerCase()) && !s.is_deleted);
    const cohortStudentIds = new Set(cohortStudents.map(s => s.id));
    const uploadedRolls = new Set(attendanceImportBatch.filter(item => item.isValid).map(item => item.roll.toLowerCase()));

    // OPTIMIZATION: Filter out existing attendance and auto-fines ONCE before the loop
    db.eventAttendance = db.eventAttendance.filter(a => !(a.event_id === event.id && cohortStudentIds.has(a.student_id)));
    db.fines = db.fines.filter(f => !(f.event_id === event.id && cohortStudentIds.has(f.student_id) && f.source === 'EVENT_AUTO'));

    // Active absence category reference to match by name
    const activeAbsenceCategory = db.violations.find(v => v.id === absenceCatId);

    const timestamp = new Date().toISOString();

    cohortStudents.forEach(student => {
        const hasMatched = uploadedRolls.has(student.roll_number.toLowerCase());
        const attendanceId = generateUUID();

        if (uploadType === 'present') {
            if (hasMatched) {
                attendedCount++;
                const record = {
                    id: attendanceId,
                    event_id: event.id,
                    student_id: student.id,
                    attendance_status: 'ATTENDED',
                    attended_date_time: timestamp,
                    created_at: timestamp
                };
                db.eventAttendance.push(record);
                newAttendance.push(record);
            } else {
                absentFinedCount++;

                // Resolve equivalent violation category matching the student's cohort name
                let studentAbsenceCatId = absenceCatId;
                if (activeAbsenceCategory && student.cohort.toLowerCase() !== activeAbsenceCategory.cohort.toLowerCase()) {
                    const matchingCat = db.violations.find(v => v.cohort.toLowerCase() === student.cohort.toLowerCase() && v.category_name.toLowerCase() === activeAbsenceCategory.category_name.toLowerCase());
                    if (matchingCat) {
                        studentAbsenceCatId = matchingCat.id;
                    }
                }

                const violation = db.violations.find(v => v.id === studentAbsenceCatId);
                const monetaryPenalty = violation ? (violation.monetary_penalty_amount || 0) : 0;
                const redFlags = violation ? (violation.red_flag_count || 0) : 0;

                const record = {
                    id: attendanceId,
                    event_id: event.id,
                    student_id: student.id,
                    attendance_status: 'ABSENT',
                    attended_date_time: null,
                    created_at: timestamp
                };
                db.eventAttendance.push(record);
                newAttendance.push(record);

                const fineId = 'fine-' + generateUUID();
                const fineRecord = {
                    id: fineId,
                    student_id: student.id,
                    cohort: student.cohort,
                    violation_category_id: studentAbsenceCatId,
                    monetary_penalty_amount: monetaryPenalty,
                    red_flags: redFlags,
                    status: 'OPEN',
                    session: event.event_name,
                    differentiation_tag: '',
                    notes: `Auto-fined for missing attendance at event: ${event.event_name}`,
                    event_id: event.id,
                    source: 'EVENT_AUTO',
                    created_at: timestamp,
                    updated_at: timestamp,
                    is_deleted: false
                };
                db.fines.push(fineRecord);
                newFines.push(fineRecord);
            }
        } else {
            // Mode: Absent (Only uploaded rolls get fined)
            if (hasMatched) {
                absentFinedCount++;

                // Resolve equivalent violation category matching the student's cohort name
                let studentAbsenceCatId = absenceCatId;
                if (activeAbsenceCategory && student.cohort.toLowerCase() !== activeAbsenceCategory.cohort.toLowerCase()) {
                    const matchingCat = db.violations.find(v => v.cohort.toLowerCase() === student.cohort.toLowerCase() && v.category_name.toLowerCase() === activeAbsenceCategory.category_name.toLowerCase());
                    if (matchingCat) {
                        studentAbsenceCatId = matchingCat.id;
                    }
                }

                const violation = db.violations.find(v => v.id === studentAbsenceCatId);
                const monetaryPenalty = violation ? (violation.monetary_penalty_amount || 0) : 0;
                const redFlags = violation ? (violation.red_flag_count || 0) : 0;

                const record = {
                    id: attendanceId,
                    event_id: event.id,
                    student_id: student.id,
                    attendance_status: 'ABSENT',
                    attended_date_time: null,
                    created_at: timestamp
                };
                db.eventAttendance.push(record);
                newAttendance.push(record);

                const fineId = 'fine-' + generateUUID();
                const fineRecord = {
                    id: fineId,
                    student_id: student.id,
                    cohort: student.cohort,
                    violation_category_id: studentAbsenceCatId,
                    monetary_penalty_amount: monetaryPenalty,
                    red_flags: redFlags,
                    status: 'OPEN',
                    session: event.event_name,
                    differentiation_tag: '',
                    notes: `Auto-fined for missing attendance at event: ${event.event_name}`,
                    event_id: event.id,
                    source: 'EVENT_AUTO',
                    created_at: timestamp,
                    updated_at: timestamp,
                    is_deleted: false
                };
                db.fines.push(fineRecord);
                newFines.push(fineRecord);
            }
        }
    });

    // Save optimized tables
    saveTable(DB_KEYS.EVENT_ATTENDANCE, db.eventAttendance);
    saveTable(DB_KEYS.FINES, db.fines);

    // OPTIMIZATION: Create a single summary log instead of hundreds of individual ones
    const summaryDetails = uploadType === 'present'
        ? `Attendance imported for event "${event.event_name}". Marked ${attendedCount} attended, ${absentFinedCount} absent (auto-fined).`
        : `Absent students list imported for event "${event.event_name}". Marked ${absentFinedCount} absent (auto-fined).`;

    const summaryActLog = {
        id: 'act-' + generateUUID(),
        action_type: 'ATTENDANCE_IMPORTED',
        entity_type: 'EVENT',
        entity_id: event.id,
        performed_by: getAdminName(),
        details: summaryDetails,
        created_at: timestamp
    };
    db.actionLog.push(summaryActLog);
    saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);

    const summaryAudLog = {
        id: 'aud-' + generateUUID(),
        admin_username: getAdminName(),
        action_type: 'ATTENDANCE_IMPORTED',
        entity_affected: 'events',
        log_details: summaryDetails,
        created_at: timestamp
    };
    db.auditTrail.push(summaryAudLog);
    saveTable(DB_KEYS.AUDIT_TRAIL, db.auditTrail);

    // Close modal and show success toast immediately!
    closeModal('uploadAttendanceModal');
    loadEventDetailView();
    
    if (uploadType === 'present') {
        showToast(`Attendance processed successfully! Marked ${attendedCount} attended, ${absentFinedCount} absent (fined).`, 'success');
    } else {
        showToast(`Absent list processed successfully! Marked ${absentFinedCount} students as absent and registered open fines.`, 'success');
    }

    // Async Bulk Sync in background
    if (supabaseClient) {
        (async () => {
            try {
                // Delete previous event attendance and auto-fines on Supabase for the cohort students
                await supabaseClient.from('event_attendance')
                    .delete()
                    .eq('event_id', event.id)
                    .in('student_id', Array.from(cohortStudentIds));
                
                await supabaseClient.from('fines')
                    .delete()
                    .eq('event_id', event.id)
                    .eq('source', 'EVENT_AUTO')
                    .in('student_id', Array.from(cohortStudentIds));

                if (newAttendance.length > 0) {
                    await supabaseClient.from('event_attendance').upsert(newAttendance);
                }
                if (newFines.length > 0) {
                    await supabaseClient.from('fines').upsert(newFines);
                }
                await supabaseClient.from('action_log').insert(summaryActLog);
                await supabaseClient.from('audit_trail').insert(summaryAudLog);
                console.log('Asynchronous cloud sync successful for absent list import.');
            } catch (err) {
                console.error('Asynchronous attendance sync error:', err);
            }
        })();
    }
}

let eventProofImportBatch = [];

function handleEventProofCSVParsed(csvContent) {
    const rows = parseCSVContent(csvContent);
    if (rows.length < 2) {
        showToast('Empty or invalid CSV file.', 'danger');
        return;
    }

    eventProofImportBatch = [];
    const previewBody = document.getElementById('eventProofPreviewBody');
    if (!previewBody) return;
    previewBody.innerHTML = '';

    const event = db.events.find(e => e.id === currentSelectedEventId);
    if (!event) {
        showToast('No active event selected.', 'danger');
        return;
    }

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const rollIndex = headers.indexOf('roll number');
    const nameIndex = headers.indexOf('name');

    if (rollIndex === -1) {
        showToast('Roll Number column is required in the CSV.', 'danger');
        return;
    }

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2 || !row[rollIndex]) continue;

        const roll = row[rollIndex].trim();
        const name = nameIndex !== -1 && row[nameIndex] ? row[nameIndex].trim() : 'Unknown';

        const student = db.students.find(s => s.roll_number.toLowerCase() === roll.toLowerCase() && !s.is_deleted);
        let matchStatus = 'No active open fine';
        let isValid = false;
        let badgeClass = 'badge-carried';

        if (student) {
            const fine = db.fines.find(f => f.event_id === event.id && f.student_id === student.id && f.status === 'OPEN' && !f.is_deleted);
            if (fine) {
                matchStatus = 'Matching Fine Found';
                isValid = true;
                badgeClass = 'badge-closed';
            } else {
                const subFine = db.fines.find(f => f.event_id === event.id && f.student_id === student.id && f.status === 'PROOF_SUBMITTED' && !f.is_deleted);
                if (subFine) {
                    matchStatus = 'Proof already submitted';
                }
            }
        } else {
            matchStatus = 'Student roll not found';
            badgeClass = 'badge-deleted';
        }

        eventProofImportBatch.push({
            roll,
            name,
            studentId: student ? student.id : null,
            isValid
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${name}</td>
            <td style="font-family: monospace;">${roll}</td>
            <td><span class="badge ${badgeClass}">${matchStatus}</span></td>
        `;
        previewBody.appendChild(tr);
    }

    document.getElementById('eventProofPreviewCount').innerText = eventProofImportBatch.length;
    document.getElementById('eventProofPreviewContainer').style.display = 'block';
    
    document.getElementById('btnConfirmEventProofUpload').disabled = eventProofImportBatch.filter(x => x.isValid).length === 0;
}

async function executeEventProofImport() {
    const validMatches = eventProofImportBatch.filter(x => x.isValid);
    if (validMatches.length === 0) return;

    const event = db.events.find(e => e.id === currentSelectedEventId);
    if (!event) return;

    showToast('Updating fine status to Proof Submitted...', 'info');

    const updatedFines = [];
    const actionLogsBatch = [];
    const auditLogsBatch = [];
    const timestamp = new Date().toISOString();

    validMatches.forEach(match => {
        const fine = db.fines.find(f => f.event_id === event.id && f.student_id === match.studentId && f.status === 'OPEN' && !f.is_deleted);
        if (fine) {
            fine.status = 'PROOF_SUBMITTED';
            fine.updated_at = timestamp;
            updatedFines.push(fine);

            const student = db.students.find(s => s.id === match.studentId);
            const studentName = student ? student.name : 'Unknown';

            actionLogsBatch.push({
                id: 'act-' + generateUUID(),
                action_type: 'FINE_STATUS_CHANGED',
                entity_type: 'FINE',
                entity_id: fine.id,
                performed_by: getAdminName(),
                details: `Updated fine status to PROOF_SUBMITTED for ${studentName} (${event.event_name})`,
                created_at: timestamp
            });

            auditLogsBatch.push({
                id: 'aud-' + generateUUID(),
                admin_username: getAdminName(),
                action_type: 'FINE_STATUS_CHANGED',
                entity_affected: 'fines',
                log_details: `Updated status to PROOF_SUBMITTED for fine (ID: ${fine.id}) of ${studentName}`,
                created_at: timestamp
            });
        }
    });

    saveTable(DB_KEYS.FINES, db.fines);

    if (supabaseClient) {
        try {
            await supabaseClient.from('fines').upsert(updatedFines);
            if (actionLogsBatch.length > 0) {
                await supabaseClient.from('action_log').insert(actionLogsBatch);
                db.actionLog.push(...actionLogsBatch);
                saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
            }
            if (auditLogsBatch.length > 0) {
                await supabaseClient.from('audit_trail').insert(auditLogsBatch);
                db.auditTrail.push(...auditLogsBatch);
                saveTable(DB_KEYS.AUDIT_TRAIL, db.auditTrail);
            }
            showToast(`Status updated successfully for ${validMatches.length} students!`, 'success');
        } catch (err) {
            console.error('Supabase sync error on payment proof import:', err);
            showToast('Local database updated, but cloud sync failed.', 'warning');
        }
    } else {
        actionLogsBatch.forEach(l => db.actionLog.push(l));
        auditLogsBatch.forEach(l => db.auditTrail.push(l));
        saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
        saveTable(DB_KEYS.AUDIT_TRAIL, db.auditTrail);
        showToast(`Locally updated status for ${validMatches.length} students.`, 'success');
    }

    closeModal('uploadEventProofModal');
    loadEventDetailView();
}

async function markFineAsPaid(fineId) {
    const fine = db.fines.find(f => f.id === fineId);
    if (!fine) return;

    showToast('Marking fine as paid...', 'info');
    const timestamp = new Date().toISOString();
    fine.status = 'PROOF_SUBMITTED';
    fine.updated_at = timestamp;

    saveTable(DB_KEYS.FINES, db.fines);

    const student = db.students.find(s => s.id === fine.student_id);
    const studentName = student ? student.name : 'Unknown';

    const actLog = {
        id: 'act-' + generateUUID(),
        action_type: 'FINE_STATUS_CHANGED',
        entity_type: 'FINE',
        entity_id: fine.id,
        performed_by: getAdminName(),
        details: `Marked fine for ${studentName} as paid (Proof Submitted)`,
        created_at: timestamp
    };
    db.actionLog.push(actLog);
    saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);

    if (supabaseClient) {
        try {
            await supabaseClient.from('fines').update({ status: 'PROOF_SUBMITTED', updated_at: timestamp }).eq('id', fineId);
            await supabaseClient.from('action_log').insert(actLog);
        } catch(e) { console.error(e); }
    }

    showToast('Fine marked as Paid Fine.', 'success');
    loadEventDetailView();
}

function openCloseFineModal(fineId) {
    document.getElementById('cfFineId').value = fineId;
    document.getElementById('cfReason').value = 'Payment Received';
    document.getElementById('cfNotes').value = '';
    openModal('closeFineModal');
}

async function handleCloseFineSubmit(e) {
    e.preventDefault();
    const fineId = document.getElementById('cfFineId').value;
    const reason = document.getElementById('cfReason').value;
    const notes = document.getElementById('cfNotes').value.trim();

    const fine = db.fines.find(f => f.id === fineId);
    if (!fine) return;

    const timestamp = new Date().toISOString();
    fine.status = 'CLOSED';
    fine.closure_reason = reason;
    fine.closure_notes = notes;
    fine.updated_at = timestamp;

    saveTable(DB_KEYS.FINES, db.fines);

    const student = db.students.find(s => s.id === fine.student_id);
    const studentName = student ? student.name : 'Unknown';

    const actLog = {
        id: 'act-' + generateUUID(),
        action_type: 'FINE_STATUS_CHANGED',
        entity_type: 'FINE',
        entity_id: fine.id,
        performed_by: getAdminName(),
        details: `Closed fine for ${studentName}. Reason: ${reason}`,
        created_at: timestamp
    };
    db.actionLog.push(actLog);
    saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);

    if (supabaseClient) {
        try {
            await supabaseClient.from('fines').update({
                status: 'CLOSED',
                closure_reason: reason,
                closure_notes: notes,
                updated_at: timestamp
            }).eq('id', fineId);
            await supabaseClient.from('action_log').insert(actLog);
        } catch(e) { console.error(e); }
    }

    showToast('Fine closed successfully.', 'success');
    closeModal('closeFineModal');
    loadEventDetailView();
}

async function rejectFineProof(fineId) {
    const fine = db.fines.find(f => f.id === fineId);
    if (!fine) return;

    const timestamp = new Date().toISOString();
    fine.status = 'OPEN';
    fine.updated_at = timestamp;

    saveTable(DB_KEYS.FINES, db.fines);

    const student = db.students.find(s => s.id === fine.student_id);
    const studentName = student ? student.name : 'Unknown';

    const actLog = {
        id: 'act-' + generateUUID(),
        action_type: 'FINE_STATUS_CHANGED',
        entity_type: 'FINE',
        entity_id: fine.id,
        performed_by: getAdminName(),
        details: `Rejected proof for ${studentName}, moved fine back to Open`,
        created_at: timestamp
    };
    db.actionLog.push(actLog);
    saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);

    if (supabaseClient) {
        try {
            await supabaseClient.from('fines').update({ status: 'OPEN', updated_at: timestamp }).eq('id', fineId);
            await supabaseClient.from('action_log').insert(actLog);
        } catch(e) { console.error(e); }
    }

    showToast('Payment proof rejected. Fine reopened.', 'warning');
    loadEventDetailView();
}

async function reopenFine(fineId) {
    if (!confirm('Are you sure you want to reopen this closed fine? It will move back to Fined (Open) status.')) return;

    const fine = db.fines.find(f => f.id === fineId);
    if (!fine) return;

    const timestamp = new Date().toISOString();
    fine.status = 'OPEN';
    fine.closure_reason = null;
    fine.closure_notes = null;
    fine.updated_at = timestamp;

    saveTable(DB_KEYS.FINES, db.fines);

    const student = db.students.find(s => s.id === fine.student_id);
    const studentName = student ? student.name : 'Unknown';

    const actLog = {
        id: 'act-' + generateUUID(),
        action_type: 'FINE_STATUS_CHANGED',
        entity_type: 'FINE',
        entity_id: fine.id,
        performed_by: getAdminName(),
        details: `Reopened closed fine for ${studentName} back to Open`,
        created_at: timestamp
    };
    db.actionLog.push(actLog);
    saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);

    if (supabaseClient) {
        try {
            await supabaseClient.from('fines').update({
                status: 'OPEN',
                closure_reason: null,
                closure_notes: null,
                updated_at: timestamp
            }).eq('id', fineId);
            await supabaseClient.from('action_log').insert(actLog);
        } catch(e) { console.error(e); }
    }

    showToast('Fine reopened successfully.', 'success');
    loadEventDetailView();
}

function openMarkAsFinedModal(studentId, attendanceId) {
    const student = db.students.find(s => s.id === studentId);
    if (!student) return;

    document.getElementById('mafStudentId').value = studentId;
    document.getElementById('mafAttendanceId').value = attendanceId || '';
    document.getElementById('mafStudentName').value = student.name;
    document.getElementById('mafStudentRoll').value = student.roll_number;

    const categorySelect = document.getElementById('mafCategorySelect');
    if (categorySelect) {
        categorySelect.innerHTML = '<option value="" disabled selected>Select Violation Category</option>';
        
        const event = db.events.find(e => e.id === currentSelectedEventId);
        if (event) {
            const linkedEVCs = db.eventViolationCategories.filter(evc => evc.event_id === event.id);
            const catIds = linkedEVCs.map(evc => evc.violation_category_id);
            if (catIds.length === 0 && event.violation_category_id) {
                catIds.push(event.violation_category_id);
            }

            const categories = db.violations.filter(v => catIds.includes(v.id));
            categories.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.innerText = `${v.category_name} (Fee: ₹${v.monetary_penalty_amount || 0}, Flags: ${v.red_flag_count || 0})`;
                categorySelect.appendChild(opt);
            });
        }
    }

    document.getElementById('mafFineAmount').value = '';
    document.getElementById('mafRedFlags').value = '';
    document.getElementById('mafComments').value = '';

    openModal('markAsFinedModal');
}

function populateMafDefaults() {
    const catId = document.getElementById('mafCategorySelect').value;
    const category = db.violations.find(v => v.id === catId);
    if (category) {
        document.getElementById('mafFineAmount').value = category.monetary_penalty_amount || 0;
        document.getElementById('mafRedFlags').value = category.red_flag_count || 0;
    }
}

async function handleMarkAsFinedSubmit(e) {
    e.preventDefault();
    const studentId = document.getElementById('mafStudentId').value;
    const attendanceId = document.getElementById('mafAttendanceId').value;
    const catId = document.getElementById('mafCategorySelect').value;
    const amount = parseFloat(document.getElementById('mafFineAmount').value) || 0;
    const flags = parseInt(document.getElementById('mafRedFlags').value) || 0;
    const comments = document.getElementById('mafComments').value.trim();

    if (!catId) {
        showToast('Please select a violation category.', 'warning');
        return;
    }

    const student = db.students.find(s => s.id === studentId);
    const event = db.events.find(ev => ev.id === currentSelectedEventId);
    const timestamp = new Date().toISOString();
    const fineId = 'fin-' + generateUUID();

    const newFine = {
        id: fineId,
        student_id: studentId,
        violation_category_id: catId,
        event_id: currentSelectedEventId,
        monetary_penalty_amount: amount,
        red_flags: flags,
        status: 'OPEN',
        notes: comments,
        source: 'EVENT_AUTO',
        session: event ? event.event_name : 'Event Fine',
        created_at: timestamp,
        updated_at: timestamp,
        is_deleted: false
    };

    db.fines.push(newFine);
    saveTable(DB_KEYS.FINES, db.fines);

    const actLog = {
        id: 'act-' + generateUUID(),
        action_type: 'FINE_CREATED',
        entity_type: 'FINE',
        entity_id: fineId,
        performed_by: getAdminName(),
        details: `Created fine of ₹${amount} with ${flags} flags for ${student ? student.name : 'student'}`,
        created_at: timestamp
    };
    db.actionLog.push(actLog);
    saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);

    if (supabaseClient) {
        try {
            await supabaseClient.from('fines').insert(newFine);
            await supabaseClient.from('action_log').insert(actLog);
        } catch(err) { console.error(err); }
    }

    showToast('Fine record created successfully.', 'success');
    closeModal('markAsFinedModal');
    loadEventDetailView();
}

async function removeAttendanceRecord(attendanceId) {
    if (!confirm('Are you sure you want to remove this student from the registered list? (They will be marked as absent)')) return;

    const attendance = db.eventAttendance.find(a => a.id === attendanceId);
    if (!attendance) return;

    const timestamp = new Date().toISOString();
    attendance.attendance_status = 'ABSENT';
    attendance.attended_date_time = null;

    saveTable(DB_KEYS.EVENT_ATTENDANCE, db.eventAttendance);

    const student = db.students.find(s => s.id === attendance.student_id);
    const event = db.events.find(e => e.id === attendance.event_id);
    const studentName = student ? student.name : 'Unknown';
    const eventName = event ? event.event_name : 'Event';

    const actLog = {
        id: 'act-' + generateUUID(),
        action_type: 'ATTENDANCE_CHANGED',
        entity_type: 'EVENT',
        entity_id: event.id,
        performed_by: getAdminName(),
        details: `Removed ${studentName} from registered list for event: ${eventName}`,
        created_at: timestamp
    };
    db.actionLog.push(actLog);
    saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);

    if (supabaseClient) {
        try {
            await supabaseClient.from('event_attendance').update({ attendance_status: 'ABSENT', attended_date_time: null }).eq('id', attendanceId);
            await supabaseClient.from('action_log').insert(actLog);
        } catch(e) { console.error(e); }
    }

    showToast('Student removed from registered list.', 'success');
    loadEventDetailView();
}

async function bulkApproveEventProofs() {
    if (selectedEventFinesForBulk.size === 0) return;

    showToast('Promoting selected students to Registered...', 'info');

    const timestamp = new Date().toISOString();
    const updatedFines = [];
    const upsertAttendance = [];
    const actionLogsBatch = [];
    const auditLogsBatch = [];

    const event = db.events.find(e => e.id === currentSelectedEventId);
    const eventName = event ? event.event_name : 'Event';

    selectedEventFinesForBulk.forEach(fineId => {
        const fine = db.fines.find(f => f.id === fineId);
        if (fine) {
            fine.status = 'PROOF_SUBMITTED';
            fine.updated_at = timestamp;
            updatedFines.push(fine);

            const attendance = db.eventAttendance.find(a => a.event_id === fine.event_id && a.student_id === fine.student_id);
            if (attendance) {
                attendance.attendance_status = 'ATTENDED';
                attendance.attended_date_time = timestamp;
                upsertAttendance.push(attendance);
            } else {
                const newAtt = {
                    id: generateUUID(),
                    event_id: fine.event_id,
                    student_id: fine.student_id,
                    attendance_status: 'ATTENDED',
                    attended_date_time: timestamp,
                    created_at: timestamp
                };
                db.eventAttendance.push(newAtt);
                upsertAttendance.push(newAtt);
            }

            const student = db.students.find(s => s.id === fine.student_id);
            const studentName = student ? student.name : 'Unknown';

            actionLogsBatch.push({
                id: 'act-' + generateUUID(),
                action_type: 'FINE_STATUS_CHANGED',
                entity_type: 'FINE',
                entity_id: fine.id,
                performed_by: getAdminName(),
                details: `Bulk approved payment proof for ${studentName} (${eventName})`,
                created_at: timestamp
            });

            auditLogsBatch.push({
                id: 'aud-' + generateUUID(),
                admin_username: getAdminName(),
                action_type: 'FINE_STATUS_CHANGED',
                entity_affected: 'fines',
                log_details: `Bulk approved proof for fine ${fine.id}. Student ${studentName} promoted.`,
                created_at: timestamp
            });
        }
    });

    saveTable(DB_KEYS.FINES, db.fines);
    saveTable(DB_KEYS.EVENT_ATTENDANCE, db.eventAttendance);

    if (supabaseClient) {
        try {
            await supabaseClient.from('fines').upsert(updatedFines);
            await supabaseClient.from('event_attendance').upsert(upsertAttendance);
            await supabaseClient.from('action_log').insert(actionLogsBatch);
            await supabaseClient.from('audit_trail').insert(auditLogsBatch);
            db.actionLog.push(...actionLogsBatch);
            db.auditTrail.push(...auditLogsBatch);
            saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
            saveTable(DB_KEYS.AUDIT_TRAIL, db.auditTrail);
            showToast('Selected students promoted to Registered successfully!', 'success');
        } catch (e) {
            console.error('Supabase bulk approve error:', e);
            showToast('Local database updated, but cloud sync failed.', 'warning');
        }
    } else {
        actionLogsBatch.forEach(l => db.actionLog.push(l));
        auditLogsBatch.forEach(l => db.auditTrail.push(l));
        saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
        saveTable(DB_KEYS.AUDIT_TRAIL, db.auditTrail);
        showToast('Selected students promoted to Registered successfully!', 'success');
    }

    selectedEventFinesForBulk.clear();
    updateEventDetailBulkActionsBar();
    loadEventDetailView();
}

async function deleteIndividualEventFine(fineId) {
    if (!confirm('Are you sure you want to delete this fine record?')) return;

    const fine = db.fines.find(f => f.id === fineId);
    if (!fine) return;

    const timestamp = new Date().toISOString();
    fine.is_deleted = true;
    fine.updated_at = timestamp;

    saveTable(DB_KEYS.FINES, db.fines);

    const student = db.students.find(s => s.id === fine.student_id);
    const studentName = student ? student.name : 'Unknown';

    const actLog = {
        id: 'act-' + generateUUID(),
        action_type: 'FINE_DELETED',
        entity_type: 'FINE',
        entity_id: fine.id,
        performed_by: getAdminName(),
        details: `Deleted fine record for ${studentName}`,
        created_at: timestamp
    };

    if (supabaseClient) {
        try {
            await supabaseClient.from('fines').update({ is_deleted: true, updated_at: timestamp }).eq('id', fine.id);
            await supabaseClient.from('action_log').insert(actLog);
            db.actionLog.push(actLog);
            saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
            showToast('Fine deleted successfully!', 'success');
        } catch (e) {
            console.error('Delete fine error:', e);
            showToast('Local database updated, but cloud deletion failed.', 'warning');
        }
    } else {
        db.actionLog.push(actLog);
        saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
        showToast('Fine deleted successfully!', 'success');
    }

    selectedEventFinesForBulk.delete(fineId);
    updateEventDetailBulkActionsBar();
    loadEventDetailView();
}

async function bulkDeleteEventFines() {
    if (selectedEventFinesForBulk.size === 0) return;
    if (!confirm(`Are you sure you want to delete the ${selectedEventFinesForBulk.size} selected fines?`)) return;

    const timestamp = new Date().toISOString();
    const deletedFines = [];
    const actionLogs = [];

    selectedEventFinesForBulk.forEach(fineId => {
        const fine = db.fines.find(f => f.id === fineId);
        if (fine) {
            fine.is_deleted = true;
            fine.updated_at = timestamp;
            deletedFines.push(fine);

            const student = db.students.find(s => s.id === fine.student_id);
            const studentName = student ? student.name : 'Unknown';

            actionLogs.push({
                id: 'act-' + generateUUID(),
                action_type: 'FINE_DELETED',
                entity_type: 'FINE',
                entity_id: fine.id,
                performed_by: getAdminName(),
                details: `Bulk deleted fine record for ${studentName}`,
                created_at: timestamp
            });
        }
    });

    saveTable(DB_KEYS.FINES, db.fines);

    if (supabaseClient) {
        try {
            await supabaseClient.from('fines').upsert(deletedFines);
            await supabaseClient.from('action_log').insert(actionLogs);
            db.actionLog.push(...actionLogs);
            saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
            showToast('Selected fines deleted successfully!', 'success');
        } catch (e) {
            console.error('Bulk delete fines error:', e);
            showToast('Local database updated, but cloud deletion failed.', 'warning');
        }
    } else {
        actionLogs.forEach(l => db.actionLog.push(l));
        saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
        showToast('Selected fines deleted successfully!', 'success');
    }

    selectedEventFinesForBulk.clear();
    updateEventDetailBulkActionsBar();
    loadEventDetailView();
}

async function moveStudentFromRegisteredToFined(attendanceId) {
    const attendance = db.eventAttendance.find(a => a.id === attendanceId);
    if (!attendance) return;

    const event = db.events.find(e => e.id === attendance.event_id);
    if (!event) return;

    showToast('Moving student back to Fined list...', 'info');

    const timestamp = new Date().toISOString();
    attendance.attendance_status = 'ABSENT';
    attendance.attended_date_time = null;

    let fine = db.fines.find(f => f.event_id === attendance.event_id && f.student_id === attendance.student_id);
    
    const violation = db.violations.find(v => v.id === event.violation_category_id);
    const monetaryPenalty = violation ? (violation.monetary_penalty_amount || 0) : 0;
    const redFlags = violation ? (violation.red_flags || 0) : 0;

    let fineId = '';
    const updatedFines = [];

    if (fine) {
        fineId = fine.id;
        fine.status = 'OPEN';
        fine.is_deleted = false;
        fine.updated_at = timestamp;
        updatedFines.push(fine);
    } else {
        fineId = 'fine-' + generateUUID();
        const student = db.students.find(s => s.id === attendance.student_id);
        const newFine = {
            id: fineId,
            student_id: attendance.student_id,
            cohort: student ? student.cohort : event.cohort,
            violation_category_id: event.violation_category_id,
            monetary_penalty_amount: monetaryPenalty,
            red_flags: redFlags,
            status: 'OPEN',
            session: event.event_name,
            differentiation_tag: '',
            notes: `Auto-fined (Moved back from Registered) for event: ${event.event_name}`,
            event_id: event.id,
            source: 'EVENT_AUTO',
            created_at: timestamp,
            updated_at: timestamp,
            is_deleted: false
        };
        db.fines.push(newFine);
        updatedFines.push(newFine);
    }

    saveTable(DB_KEYS.EVENT_ATTENDANCE, db.eventAttendance);
    saveTable(DB_KEYS.FINES, db.fines);

    const student = db.students.find(s => s.id === attendance.student_id);
    const studentName = student ? student.name : 'Unknown';

    const actLog = {
        id: 'act-' + generateUUID(),
        action_type: 'FINE_STATUS_CHANGED',
        entity_type: 'FINE',
        entity_id: fineId,
        performed_by: getAdminName(),
        details: `Moved ${studentName} back to Fined list for event ${event.event_name}`,
        created_at: timestamp
    };

    if (supabaseClient) {
        try {
            await supabaseClient.from('event_attendance').update({ attendance_status: 'ABSENT', attended_date_time: null }).eq('id', attendanceId);
            await supabaseClient.from('fines').upsert(updatedFines);
            await supabaseClient.from('action_log').insert(actLog);
            db.actionLog.push(actLog);
            saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
            showToast('Student moved back to Fined successfully.', 'success');
        } catch (e) {
            console.error('Move back to Fined error:', e);
            showToast('Local database updated, but cloud sync failed.', 'warning');
        }
    } else {
        db.actionLog.push(actLog);
        saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
        showToast('Student moved back to Fined locally.', 'success');
    }

    loadEventDetailView();
}

function loadRedFlagsRegistry() {
    const search = document.getElementById('redFlagsSearchInput').value.trim().toLowerCase();
    const cohort = document.getElementById('redFlagsCohortFilter').value;
    const range = document.getElementById('redFlagsRangeFilter').value;

    const tbody = document.getElementById('redFlagsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const flagData = {};
    const activeFines = db.fines.filter(f => !f.is_deleted);

    activeFines.forEach(fine => {
        const student = db.students.find(s => s.id === fine.student_id && !s.is_deleted);
        if (!student) return;

        if (!flagData[student.id]) {
            flagData[student.id] = {
                student: student,
                totalFlags: 0,
                breakdown: {},
                lastDate: ''
            };
        }

        const data = flagData[student.id];
        data.totalFlags += (fine.red_flags || 0);

        const sourceName = fine.source === 'EVENT_AUTO' ? (fine.session || 'Event Auto') : 'Direct Manual';
        data.breakdown[sourceName] = (data.breakdown[sourceName] || 0) + (fine.red_flags || 0);

        const fineDate = fine.created_at || '';
        if (fineDate && (!data.lastDate || fineDate > data.lastDate)) {
            data.lastDate = fineDate;
        }
    });

    db.students.forEach(student => {
        if (student.is_deleted) return;
        if (!flagData[student.id]) {
            flagData[student.id] = {
                student: student,
                totalFlags: 0,
                breakdown: {},
                lastDate: 'N/A'
            };
        }
    });

    let list = Object.values(flagData);

    list = list.filter(item => {
        if (cohort && item.student.cohort !== cohort) return false;

        if (search) {
            const matchesName = item.student.name.toLowerCase().includes(search);
            const matchesRoll = item.student.roll_number.toLowerCase().includes(search);
            if (!matchesName && !matchesRoll) return false;
        }

        if (range) {
            if (range === '0-1') {
                if (item.totalFlags > 1) return false;
            } else if (range === '1-2') {
                if (item.totalFlags < 1 || item.totalFlags > 2) return false;
            } else if (range === '2-3') {
                if (item.totalFlags < 2 || item.totalFlags > 3) return false;
            } else if (range === '3+') {
                if (item.totalFlags < 3) return false;
            }
        }

        return true;
    });

    list.sort((a, b) => b.totalFlags - a.totalFlags);

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--color-text-muted);">No records found matching filter criteria.</td></tr>`;
        return;
    }

    list.forEach(item => {
        const student = item.student;
        
        const breakdownParts = [];
        for (const [source, count] of Object.entries(item.breakdown)) {
            if (count > 0) {
                breakdownParts.push(`${source} (${count})`);
            }
        }
        const breakdownStr = breakdownParts.length > 0 ? breakdownParts.join(', ') : 'None';

        let lastDateStr = item.lastDate;
        if (lastDateStr && lastDateStr !== 'N/A' && lastDateStr.includes('T')) {
            lastDateStr = new Date(lastDateStr).toLocaleDateString();
        }

        let statusBadge = '<span class="badge badge-closed">Good Standing</span>';
        if (item.totalFlags >= 3) {
            statusBadge = '<span class="badge badge-deleted" style="font-weight:700;">Suspended (3+ Flags)</span>';
        } else if (item.totalFlags > 0) {
            statusBadge = '<span class="badge badge-carried">Active Warning</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600;">${student.name}</td>
            <td style="font-family: monospace; font-size: 13px;">${student.roll_number}</td>
            <td><span class="badge ${student.cohort === 'SUMMER_2026_27' ? 'badge-open' : 'badge-carried'}">${student.cohort}</span></td>
            <td style="text-align: center;"><span class="red-flags-count-badge ${item.totalFlags >= 3 ? '' : 'zero'}" style="font-size: 13px; padding: 4px 10px;">${item.totalFlags}</span></td>
            <td style="font-size: 12px; color: var(--color-text-secondary); max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${breakdownStr}">${breakdownStr}</td>
            <td>${lastDateStr || 'N/A'}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="openRedFlagDetailModal('${student.id}')">View Details</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openRedFlagDetailModal(studentId) {
    const student = db.students.find(s => s.id === studentId);
    if (!student) return;

    document.getElementById('rfDetailStudentName').innerText = student.name;
    document.getElementById('rfDetailStudentRoll').innerText = student.roll_number;
    document.getElementById('rfDetailStudentCohort').innerText = student.cohort;

    const fines = db.fines.filter(f => f.student_id === studentId && !f.is_deleted && f.status !== 'CLOSED');
    
    let totalFlags = 0;
    const body = document.getElementById('rfDetailFinesBody');
    if (!body) return;
    body.innerHTML = '';

    if (fines.length === 0) {
        body.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted);">No active fines or violations contributing to red flags.</td></tr>`;
    } else {
        fines.forEach(fine => {
            totalFlags += (fine.red_flags || 0);

            const category = db.violations.find(v => v.id === fine.violation_category_id);
            const categoryName = category ? category.category_name : 'Unknown';

            let fineDate = fine.created_at || 'N/A';
            if (fineDate && fineDate !== 'N/A' && fineDate.includes('T')) {
                fineDate = new Date(fineDate).toLocaleDateString();
            }

            const sourceStr = fine.source === 'EVENT_AUTO' ? 'Event Auto' : 'Direct Manual';
            const statusBadge = fine.status === 'PROOF_SUBMITTED' ? '<span class="badge badge-proof">Proof Submitted</span>' : '<span class="badge badge-open">Open</span>';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${fineDate}</td>
                <td style="font-weight: 600;">${categoryName}</td>
                <td>${formatINR(fine.monetary_penalty_amount)}</td>
                <td style="font-weight: 600; color: var(--color-danger); text-align: center;">${fine.red_flags}</td>
                <td><span class="badge btn-outline" style="font-size: 11px;">${sourceStr}</span></td>
                <td>${statusBadge}</td>
            `;
            body.appendChild(tr);
        });
    }

    const badge = document.getElementById('rfDetailTotalBadge');
    if (badge) {
        badge.innerText = `${totalFlags} Red Flag${totalFlags === 1 ? '' : 's'}`;
        badge.className = totalFlags >= 3 ? 'badge badge-deleted' : (totalFlags > 0 ? 'badge badge-carried' : 'badge badge-closed');
    }

    openModal('redFlagDetailModal');
}

function exportRedFlagsCSV() {
    let csvContent = "Student Name,Roll Number,Cohort,Total Red Flags,Flag Breakdown,Last Violation Date,Status\n";

    const activeFines = db.fines.filter(f => !f.is_deleted && f.status !== 'CLOSED');

    const flagData = {};
    activeFines.forEach(fine => {
        const student = db.students.find(s => s.id === fine.student_id && !s.is_deleted);
        if (!student) return;

        if (!flagData[student.id]) {
            flagData[student.id] = {
                student: student,
                totalFlags: 0,
                breakdown: {},
                lastDate: ''
            };
        }

        const data = flagData[student.id];
        data.totalFlags += (fine.red_flags || 0);

        const sourceName = fine.source === 'EVENT_AUTO' ? (fine.session || 'Event Auto') : 'Direct Manual';
        data.breakdown[sourceName] = (data.breakdown[sourceName] || 0) + (fine.red_flags || 0);

        const fineDate = fine.created_at || '';
        if (fineDate && (!data.lastDate || fineDate > data.lastDate)) {
            data.lastDate = fineDate;
        }
    });

    db.students.forEach(student => {
        if (student.is_deleted) return;
        if (!flagData[student.id]) {
            flagData[student.id] = {
                student: student,
                totalFlags: 0,
                breakdown: {},
                lastDate: 'N/A'
            };
        }
    });

    Object.values(flagData).forEach(item => {
        const student = item.student;
        const breakdownParts = [];
        for (const [source, count] of Object.entries(item.breakdown)) {
            if (count > 0) breakdownParts.push(`${source} (${count})`);
        }
        const breakdownStr = breakdownParts.length > 0 ? breakdownParts.join('; ') : 'None';
        let lastDateStr = item.lastDate;
        if (lastDateStr && lastDateStr !== 'N/A' && lastDateStr.includes('T')) {
            lastDateStr = new Date(lastDateStr).toLocaleDateString();
        }

        const status = item.totalFlags >= 3 ? 'Suspended' : (item.totalFlags > 0 ? 'Warning' : 'Good Standing');

        csvContent += `"${student.name}","${student.roll_number}","${student.cohort}",${item.totalFlags},"${breakdownStr}","${lastDateStr || 'N/A'}","${status}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Red_Flag_Registry_Export_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

let violationsImportBatch = [];

function openUploadViolationsModal() {
    violationsImportBatch = [];
    document.getElementById('violationsFileInput').value = '';
    document.getElementById('violationsPreviewContainer').style.display = 'none';
    document.getElementById('btnConfirmViolationsUpload').disabled = true;
    openModal('uploadViolationsModal');
}

function handleViolationsCSVParsed(csvContent) {
    const rows = parseCSVContent(csvContent);
    if (rows.length < 2) {
        showToast('Empty or invalid file.', 'danger');
        return;
    }

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const rollIdx = headers.indexOf('roll number');
    const nameIdx = headers.indexOf('name');
    const catIdx = headers.indexOf('category');
    const penaltyIdx = headers.indexOf('penalty override');
    const flagsIdx = headers.indexOf('flags override');
    const notesIdx = headers.indexOf('notes');

    if (rollIdx === -1 || nameIdx === -1 || catIdx === -1) {
        showToast('Missing mandatory headers: Roll Number, Name, Category are required', 'danger');
        return;
    }

    const event = db.events.find(e => e.id === currentSelectedEventId);
    if (!event) return;

    violationsImportBatch = [];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2 || (row.length === 1 && row[0] === '')) continue;

        const roll = row[rollIdx]?.trim().toUpperCase() || '';
        const name = row[nameIdx]?.trim() || '';
        const categoryName = row[catIdx]?.trim() || '';
        const penaltyOverride = (row[penaltyIdx] && row[penaltyIdx] !== '') ? parseFloat(row[penaltyIdx]) : null;
        const flagsOverride = (row[flagsIdx] && row[flagsIdx] !== '') ? parseInt(row[flagsIdx]) : null;
        const notes = notesIdx !== -1 ? row[notesIdx]?.trim() || '' : '';

        violationsImportBatch.push({
            roll_number: roll,
            name: name,
            categoryName: categoryName,
            monetary_penalty_amount: penaltyOverride,
            red_flags: flagsOverride,
            notes: notes,
            isValid: true,
            errors: []
        });
    }

    renderViolationsPreview();
}

function renderViolationsPreview() {
    const tbody = document.getElementById('violationsPreviewBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const event = db.events.find(e => e.id === currentSelectedEventId);
    if (!event) return;

    const linkedEVCs = db.eventViolationCategories.filter(evc => evc.event_id === event.id);
    const catIds = linkedEVCs.map(evc => evc.violation_category_id);
    if (catIds.length === 0 && event.violation_category_id) {
        catIds.push(event.violation_category_id);
    }
    const eventCategories = db.violations.filter(v => catIds.includes(v.id));

    const batchRolls = {};
    let validCount = 0;

    violationsImportBatch.forEach((item, index) => {
        item.errors = [];
        item.isValid = true;

        if (item.roll_number) {
            if (batchRolls[item.roll_number]) {
                item.isValid = false;
                item.errors.push(`Duplicate roll in upload batch`);
            } else {
                batchRolls[item.roll_number] = true;
            }
        } else {
            item.isValid = false;
            item.errors.push(`Roll number is required`);
        }

        const masterStudent = db.students.find(s => s.roll_number === item.roll_number && !s.is_deleted);
        if (!masterStudent) {
            item.isValid = false;
            item.errors.push(`Roll number not in Student Master`);
        } else {
            if (item.name && masterStudent.name.toLowerCase() !== item.name.toLowerCase()) {
                item.errors.push(`Warning: Name mismatch (Master: "${masterStudent.name}")`);
            }
            const eventCohorts = event.cohort.split(',').map(c => c.trim().toLowerCase());
            if (!eventCohorts.includes(masterStudent.cohort.toLowerCase())) {
                item.isValid = false;
                item.errors.push(`Student cohort (${masterStudent.cohort}) mismatches event cohorts (${event.cohort})`);
            }
        }

        let resolvedCatId = '';
        let matchedCat = eventCategories.find(c => c.category_name.toLowerCase() === item.categoryName.toLowerCase() || c.id === item.categoryName);
        
        if (!matchedCat && masterStudent) {
            matchedCat = db.violations.find(v => v.cohort === masterStudent.cohort && (v.category_name.toLowerCase() === item.categoryName.toLowerCase() || v.id === item.categoryName));
        }

        if (matchedCat) {
            resolvedCatId = matchedCat.id;
            if (item.monetary_penalty_amount === null || isNaN(item.monetary_penalty_amount)) {
                item.monetary_penalty_amount = matchedCat.monetary_penalty_amount || 0;
            }
            if (item.red_flags === null || isNaN(item.red_flags)) {
                item.red_flags = matchedCat.red_flag_count || 0;
            }
        } else {
            item.isValid = false;
            item.errors.push(`Violation category not linked to this event`);
        }

        if (item.isValid) validCount++;

        const tr = document.createElement('tr');
        tr.className = item.isValid ? '' : 'has-error';

        let catOptions = `<option value="" disabled ${!resolvedCatId ? 'selected' : ''}>Select Category</option>`;
        eventCategories.forEach(c => {
            catOptions += `<option value="${c.id}" ${resolvedCatId === c.id ? 'selected' : ''}>${c.category_name}</option>`;
        });

        const statusMsg = item.errors.length > 0 ? item.errors.join('<br>') : 'OK (Valid)';

        tr.innerHTML = `
            <td>
                <input type="text" class="form-input form-input-sm" style="font-family: monospace; width: 110px;" value="${item.roll_number}" onchange="updateViolationRow(${index}, 'roll_number', this.value)">
            </td>
            <td>
                <input type="text" class="form-input form-input-sm" style="width: 140px;" value="${item.name}" onchange="updateViolationRow(${index}, 'name', this.value)">
            </td>
            <td>
                <select class="form-input form-input-sm" style="max-width: 180px;" onchange="updateViolationRow(${index}, 'categoryName', this.value)">
                    ${catOptions}
                </select>
            </td>
            <td>
                <input type="number" class="form-input form-input-sm" style="width: 80px;" value="${item.monetary_penalty_amount || 0}" onchange="updateViolationRow(${index}, 'monetary_penalty_amount', parseFloat(this.value) || 0)">
            </td>
            <td>
                <input type="number" class="form-input form-input-sm" style="width: 60px;" min="0" value="${item.red_flags || 0}" onchange="updateViolationRow(${index}, 'red_flags', parseInt(this.value) || 0)">
            </td>
            <td style="font-size: 11px; ${item.isValid ? 'color: var(--color-success);' : 'color: var(--color-danger); font-weight: 600;'}">
                ${statusMsg}
            </td>
            <td>
                <button class="btn btn-outline btn-sm" style="color: var(--color-danger); border-color: rgba(239,68,68,0.2); padding: 4px 6px;" onclick="deleteViolationRow(${index})">&times;</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('violationsPreviewCount').innerText = violationsImportBatch.length;
    document.getElementById('violationsPreviewContainer').style.display = 'block';
    document.getElementById('btnConfirmViolationsUpload').disabled = (validCount === 0);
}

function updateViolationRow(index, key, val) {
    if (violationsImportBatch[index]) {
        violationsImportBatch[index][key] = val;
        if (key === 'categoryName') {
            const category = db.violations.find(v => v.id === val);
            if (category) {
                violationsImportBatch[index].monetary_penalty_amount = category.monetary_penalty_amount || 0;
                violationsImportBatch[index].red_flags = category.red_flag_count || 0;
            }
        }
        renderViolationsPreview();
    }
}

function deleteViolationRow(index) {
    violationsImportBatch.splice(index, 1);
    renderViolationsPreview();
}

async function executeViolationsImport() {
    const validItems = violationsImportBatch.filter(item => item.isValid);
    if (validItems.length === 0) return;

    const event = db.events.find(e => e.id === currentSelectedEventId);
    if (!event) return;

    showToast('Importing fines...', 'info');

    const timestamp = new Date().toISOString();
    const newFines = [];
    const actionLogsBatch = [];

    validItems.forEach(item => {
        const student = db.students.find(s => s.roll_number === item.roll_number && !s.is_deleted);
        if (!student) return;

        let catId = item.categoryName;
        const category = db.violations.find(v => v.id === catId || v.category_name.toLowerCase() === catId.toLowerCase());
        if (category) catId = category.id;

        const fineId = 'fin-' + generateUUID();
        const fineRecord = {
            id: fineId,
            student_id: student.id,
            violation_category_id: catId,
            event_id: event.id,
            monetary_penalty_amount: item.monetary_penalty_amount,
            red_flags: item.red_flags,
            status: 'OPEN',
            notes: item.notes || `Bulk imported violation for event: ${event.event_name}`,
            source: 'EVENT_AUTO',
            session: event.event_name,
            created_at: timestamp,
            updated_at: timestamp,
            is_deleted: false
        };

        db.fines.push(fineRecord);
        newFines.push(fineRecord);

        actionLogsBatch.push({
            id: 'act-' + generateUUID(),
            action_type: 'FINE_CREATED',
            entity_type: 'FINE',
            entity_id: fineId,
            performed_by: getAdminName(),
            details: `Bulk imported fine of ₹${item.monetary_penalty_amount} for ${student.name}`,
            created_at: timestamp
        });
    });

    saveTable(DB_KEYS.FINES, db.fines);

    if (supabaseClient) {
        try {
            await supabaseClient.from('fines').insert(newFines);
            await supabaseClient.from('action_log').insert(actionLogsBatch);
            db.actionLog.push(...actionLogsBatch);
            saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
        } catch(err) { console.error(err); }
    } else {
        actionLogsBatch.forEach(l => db.actionLog.push(l));
        saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
    }

    showToast(`Successfully imported ${validItems.length} fines.`, 'success');
    closeModal('uploadViolationsModal');
    loadEventDetailView();
}

function openAddEventFineManualModal() {
    const form = document.getElementById('addEventFineManualForm');
    if (form) form.reset();

    const radios = document.getElementsByName('efmSource');
    if (radios.length > 0) radios[0].checked = true;

    const customGroup = document.getElementById('efmCustomCategoryGroup');
    if (customGroup) {
        customGroup.style.display = 'none';
        document.getElementById('efmCustomCategory').value = '';
    }

    const categorySelect = document.getElementById('efmCategorySelect');
    if (categorySelect) {
        categorySelect.innerHTML = '<option value="" disabled selected>Select Violation Category</option>';
        
        const event = db.events.find(e => e.id === currentSelectedEventId);
        if (event) {
            const linkedEVCs = db.eventViolationCategories.filter(evc => evc.event_id === event.id);
            const catIds = linkedEVCs.map(evc => evc.violation_category_id);
            if (catIds.length === 0 && event.violation_category_id) {
                catIds.push(event.violation_category_id);
            }

            const categories = db.violations.filter(v => catIds.includes(v.id));
            categories.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.innerText = `${v.category_name} (₹${v.monetary_penalty_amount || 0}, Flags: ${v.red_flag_count || 0})`;
                categorySelect.appendChild(opt);
            });
        }
        
        // Add custom option
        const customOpt = document.createElement('option');
        customOpt.value = "CUSTOM";
        customOpt.innerText = "-- Enter Custom Category --";
        categorySelect.appendChild(customOpt);
    }

    populateEfmStudents();
    openModal('addEventFineManualModal');
}

function populateEfmStudents() {
    const select = document.getElementById('efmStudentSelect');
    if (!select) return;
    select.innerHTML = '<option value="" disabled selected>Select Student</option>';

    const event = db.events.find(e => e.id === currentSelectedEventId);
    if (!event) return;

    const sourceVal = document.querySelector('input[name="efmSource"]:checked')?.value || 'ATTENDANCE';

    if (sourceVal === 'ATTENDANCE') {
        const attended = db.eventAttendance.filter(a => a.event_id === event.id && a.attendance_status === 'ATTENDED');
        attended.forEach(a => {
            const s = db.students.find(st => st.id === a.student_id && !st.is_deleted);
            if (s) {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.innerText = `${s.name} (${s.roll_number})`;
                select.appendChild(opt);
            }
        });
    } else {
        const eventCohorts = event.cohort.split(',').map(c => c.trim().toLowerCase());
        const cohortStudents = db.students.filter(s => eventCohorts.includes(s.cohort.toLowerCase()) && !s.is_deleted);
        cohortStudents.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.innerText = `${s.name} (${s.roll_number})`;
            select.appendChild(opt);
        });
    }
}

function populateEfmDefaults() {
    const catId = document.getElementById('efmCategorySelect').value;
    const customGroup = document.getElementById('efmCustomCategoryGroup');
    const amtInput = document.getElementById('efmFineAmount');
    const flagsInput = document.getElementById('efmRedFlags');

    if (catId === 'CUSTOM') {
        if (customGroup) customGroup.style.display = 'block';
        amtInput.value = '';
        flagsInput.value = '0';
    } else {
        if (customGroup) customGroup.style.display = 'none';
        const category = db.violations.find(v => v.id === catId);
        if (category) {
            amtInput.value = category.monetary_penalty_amount || 0;
            flagsInput.value = category.red_flag_count || 0;
        }
    }
}

async function handleAddEventFineManualSubmit(e) {
    e.preventDefault();

    const studentId = document.getElementById('efmStudentSelect').value;
    const catId = document.getElementById('efmCategorySelect').value;
    const amount = parseFloat(document.getElementById('efmFineAmount').value) || 0;
    const flags = parseInt(document.getElementById('efmRedFlags').value) || 0;
    const comments = document.getElementById('efmComments').value.trim();

    if (!studentId || !catId) {
        showToast('Please fill in all mandatory fields.', 'warning');
        return;
    }

    const event = db.events.find(ev => ev.id === currentSelectedEventId);
    const student = db.students.find(s => s.id === studentId);
    if (!event || !student) return;

    let resolvedCatId = catId;
    const timestamp = new Date().toISOString();

    if (catId === 'CUSTOM') {
        const customName = document.getElementById('efmCustomCategory').value.trim();
        if (!customName) {
            showToast('Please enter a custom category name.', 'warning');
            return;
        }

        let existing = db.violations.find(v => v.cohort === student.cohort && v.category_name.toLowerCase() === customName.toLowerCase());
        if (!existing) {
            const newCatId = 'violation-' + generateUUID();
            existing = {
                id: newCatId,
                category_name: customName,
                parent_category: 'Custom Overrides',
                cohort: student.cohort,
                monetary_penalty_amount: amount,
                red_flag_count: flags,
                combination_type: (amount > 0 && flags > 0) ? 'BOTH' : (flags > 0 ? 'RED_FLAG_ONLY' : 'MONETARY_ONLY'),
                description: 'Manually entered custom category'
            };
            db.violations.push(existing);
            saveTable(DB_KEYS.VIOLATIONS, db.violations);
            
            if (supabaseClient) {
                pushToCloud('violations', existing);
            }
        }
        resolvedCatId = existing.id;

        // Associate with this event dynamically
        const alreadyLinked = db.eventViolationCategories.some(evc => evc.event_id === event.id && evc.violation_category_id === resolvedCatId);
        if (!alreadyLinked) {
            const newEvc = {
                id: 'evc-' + generateUUID(),
                event_id: event.id,
                violation_category_id: resolvedCatId,
                added_date: timestamp
            };
            db.eventViolationCategories.push(newEvc);
            saveTable(DB_KEYS.EVENT_VIOLATION_CATEGORIES, db.eventViolationCategories);

            if (supabaseClient) {
                pushToCloud('event_violation_categories', newEvc);
            }
        }
    }

    const existingFines = db.fines.filter(f => f.event_id === event.id && f.student_id === studentId && f.violation_category_id === resolvedCatId && !f.is_deleted);
    
    let diffTag = '';
    if (existingFines.length > 0) {
        const proceed = confirm(`Warning: ${student.name} already has an active fine record in this category for this event. Do you want to add another violation instance?`);
        if (!proceed) return;
        diffTag = `Violation-${existingFines.length + 1}`;
    }

    const fineId = 'fin-' + generateUUID();

    const newFine = {
        id: fineId,
        student_id: studentId,
        violation_category_id: resolvedCatId,
        event_id: event.id,
        monetary_penalty_amount: amount,
        red_flags: flags,
        status: 'OPEN',
        notes: comments || `Manually assigned violation for event: ${event.event_name}`,
        differentiation_tag: diffTag,
        source: 'EVENT_AUTO',
        session: event.event_name,
        created_at: timestamp,
        updated_at: timestamp,
        is_deleted: false
    };

    db.fines.push(newFine);
    saveTable(DB_KEYS.FINES, db.fines);

    const actLog = {
        id: 'act-' + generateUUID(),
        action_type: 'FINE_CREATED',
        entity_type: 'FINE',
        entity_id: fineId,
        performed_by: getAdminName(),
        details: `Manually created fine of ₹${amount} for ${student.name} (${event.event_name})`,
        created_at: timestamp
    };
    db.actionLog.push(actLog);
    saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);

    if (supabaseClient) {
        try {
            await supabaseClient.from('fines').insert(newFine);
            await supabaseClient.from('action_log').insert(actLog);
        } catch(err) { console.error(err); }
    }

    showToast('Fine record created successfully.', 'success');
    closeModal('addEventFineManualModal');
    loadEventDetailView();
}

function loadCohortMasterView() {
    const settings = db.cohortSettings;
    if (settings) {
        document.getElementById('cmSummerYear').value = settings.summerYear || '';
        document.getElementById('cmSummerPrefix').value = settings.summerPrefix || '';
        document.getElementById('cmFinalYear').value = settings.finalYear || '';
        document.getElementById('cmFinalPrefix').value = settings.finalPrefix || '';
    }
}

function updatePrefixFromYear(type) {
    const yearInput = document.getElementById(type === 'Summer' ? 'cmSummerYear' : 'cmFinalYear');
    const prefixInput = document.getElementById(type === 'Summer' ? 'cmSummerPrefix' : 'cmFinalPrefix');
    if (!yearInput || !prefixInput) return;

    const val = yearInput.value.trim();
    const match = val.match(/^(\d{4})/) || val.match(/^(\d{2})/);
    if (match) {
        const yearPart = match[1];
        const prefix = yearPart.substring(yearPart.length - 2);
        prefixInput.value = prefix;
    }
}

async function handleCohortMasterSubmit(e) {
    e.preventDefault();
    const summerYear = document.getElementById('cmSummerYear').value.trim();
    const summerPrefix = document.getElementById('cmSummerPrefix').value.trim();
    const finalYear = document.getElementById('cmFinalYear').value.trim();
    const finalPrefix = document.getElementById('cmFinalPrefix').value.trim();

    if (!summerPrefix || !finalPrefix) {
        showToast('Prefix is required for both cohorts.', 'warning');
        return;
    }

    db.cohortSettings = {
        summerYear,
        summerPrefix,
        finalYear,
        finalPrefix
    };

    localStorage.setItem(DB_KEYS.COHORT_SETTINGS, JSON.stringify(db.cohortSettings));

    showToast('Cohort settings saved successfully!', 'success');
    
    const timestamp = new Date().toISOString();
    const actLog = {
        id: 'act-' + generateUUID(),
        action_type: 'COHORT_SETTINGS_UPDATED',
        entity_type: 'SYSTEM',
        entity_id: 'SETTINGS',
        performed_by: getAdminName(),
        details: `Updated cohort prefix rules: Summer = ${summerPrefix} (${summerYear}), Final = ${finalPrefix} (${finalYear})`,
        created_at: timestamp
    };
    db.actionLog.push(actLog);
    saveTable(DB_KEYS.ADMIN_ACTION_LOG, db.actionLog);
    
    if (supabaseClient) {
        try {
            await supabaseClient.from('action_log').insert(actLog);
        } catch(err) { console.error(err); }
    }
}

function resolveCohortFromRollNumber(rollNumber) {
    if (!rollNumber) return null;
    const cleanRoll = rollNumber.trim();
    
    if (db.cohortSettings.summerPrefix && cleanRoll.startsWith(db.cohortSettings.summerPrefix)) {
        return 'SUMMER_2026_27';
    }
    if (db.cohortSettings.finalPrefix && cleanRoll.startsWith(db.cohortSettings.finalPrefix)) {
        return 'FINAL_2026_27';
    }
    return null;
}

// Drag & drop registrations
setupDragAndDrop('attendanceDropzone', 'attendanceFileInput', handleAttendanceCSVParsed);
setupDragAndDrop('eventProofDropzone', 'eventProofFileInput', handleEventProofCSVParsed);
setupDragAndDrop('violationsDropzone', 'violationsFileInput', handleViolationsCSVParsed);

// ==========================================
// 12. INITIALIZATION
// ==========================================

function initializeApp() {
    loadDatabase();
    checkAuthentication();
    populateViolationCategoryFilters();
    
    if (supabaseClient) {
        syncWithSupabase();
        subscribeRealtime();
    }
}

function exportEventTabFilteredData(tab) {
    const event = db.events.find(e => e.id === currentSelectedEventId && !e.is_deleted);
    if (!event) return;

    const search = document.getElementById('eventDetailSearchInput').value.trim().toLowerCase();
    const cohortFilterVal = document.getElementById('eventDetailCohortFilter') ? document.getElementById('eventDetailCohortFilter').value : '';
    const categoryFilterVal = document.getElementById('eventDetailCategoryFilter') ? document.getElementById('eventDetailCategoryFilter').value : '';

    let csvContent = "";
    let fileName = "";

    if (tab === 'REGISTERED') {
        fileName = `${event.event_name.replace(/\s+/g, '_')}_registered_students.csv`;
        
        const data = db.eventAttendance.filter(a => a.event_id === event.id && a.attendance_status === 'ATTENDED').map(a => {
            const student = db.students.find(s => s.id === a.student_id);
            return {
                studentName: student ? student.name : 'Unknown Student',
                rollNumber: student ? student.roll_number : 'N/A',
                emailId: student ? student.email_id : 'N/A',
                cohort: student ? student.cohort : 'N/A',
                date: a.attended_date_time || 'N/A'
            };
        }).filter(item => {
            if (search && !item.studentName.toLowerCase().includes(search) && !item.rollNumber.toLowerCase().includes(search)) return false;
            if (cohortFilterVal && item.cohort !== cohortFilterVal) return false;
            return true;
        });

        // Generate CSV
        const headers = ["Student Name", "Roll Number", "Email ID", "Cohort", "Registered Date/Time", "Status"];
        const rows = data.map(item => [
            item.studentName,
            item.rollNumber,
            item.emailId,
            item.cohort === 'SUMMER_2026_27' ? 'Summer' : (item.cohort === 'FINAL_2026_27' ? 'Final' : item.cohort),
            item.date,
            "Registered"
        ]);

        csvContent = [headers.join(','), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    } else {
        // Fined, Paid, or Closed
        let statusFilter = '';
        if (tab === 'FINED') {
            statusFilter = 'OPEN';
            fileName = `${event.event_name.replace(/\s+/g, '_')}_fined_open.csv`;
        } else if (tab === 'PAID_FINE') {
            statusFilter = 'PROOF_SUBMITTED';
            fileName = `${event.event_name.replace(/\s+/g, '_')}_paid_proof_submitted.csv`;
        } else if (tab === 'CLOSED') {
            statusFilter = 'CLOSED';
            fileName = `${event.event_name.replace(/\s+/g, '_')}_closed.csv`;
        }

        const eventFines = db.fines.filter(f => f.event_id === event.id && !f.is_deleted);
        const data = eventFines.filter(f => f.status === statusFilter).map(fine => {
            const student = db.students.find(s => s.id === fine.student_id);
            const cat = db.violations.find(v => v.id === fine.violation_category_id);
            return {
                ...fine,
                studentName: student ? student.name : 'Unknown Student',
                rollNumber: student ? student.roll_number : 'N/A',
                emailId: student ? student.email_id : 'N/A',
                categoryName: cat ? cat.category_name : 'Direct / Custom',
                studentCohort: student ? student.cohort : 'N/A'
            };
        }).filter(fine => {
            if (search && !fine.studentName.toLowerCase().includes(search) && !fine.rollNumber.toLowerCase().includes(search)) return false;
            if (cohortFilterVal && fine.studentCohort !== cohortFilterVal) return false;
            if (categoryFilterVal && fine.violation_category_id !== categoryFilterVal) return false;
            return true;
        });

        // Generate CSV
        const headers = ["Student Name", "Roll Number", "Email ID", "Cohort", "Session", "Violation Category", "Monetary Penalty Amount", "Red Flags", "Status", "Notes/Comments", "Created Date", "Closed Date"];
        const rows = data.map(fine => [
            fine.studentName,
            fine.rollNumber,
            fine.emailId,
            fine.studentCohort === 'SUMMER_2026_27' ? 'Summer' : (fine.studentCohort === 'FINAL_2026_27' ? 'Final' : fine.studentCohort),
            event.event_name,
            fine.categoryName,
            fine.monetary_penalty_amount || 0,
            fine.red_flags || 0,
            fine.status,
            fine.notes_comments || '',
            fine.created_at || '',
            fine.closed_at || ''
        ]);

        csvContent = [headers.join(','), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    }

    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    showToast(`Successfully exported filtered tab data!`, 'success');
}

function openCreateEventModal() {
    const form = document.getElementById('createEventForm');
    if (form) form.reset();

    // Reset cohorts checkbox selection
    document.querySelectorAll('input[name="newEventCohort"]').forEach(cb => cb.checked = false);

    // Hide categories dropdown and clear content
    const dropdown = document.getElementById('newEventCategoriesDropdown');
    if (dropdown) dropdown.style.display = 'none';

    const container = document.getElementById('newEventCategoriesContainer');
    if (container) container.innerHTML = '';

    const btn = document.getElementById('newEventCategoriesBtn');
    if (btn) btn.style.display = 'none';

    const placeholder = document.getElementById('newEventCategoriesPlaceholder');
    if (placeholder) {
        placeholder.style.display = 'block';
        placeholder.innerText = 'Select cohort first to see matching categories.';
    }

    openModal('createEventModal');
}

// Safe check if document has already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
