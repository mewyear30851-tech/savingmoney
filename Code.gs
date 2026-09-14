/**
 * ============================================================================
 * EMBER MONEY MANAGER - GOOGLE APPS SCRIPT BACKEND (Code.gs)
 * ============================================================================
 * Architecture: Single-file backend for Google Apps Script Web App API.
 * Storage: Google Sheets (Database) & Google Drive (Receipt File Storage).
 * Author: Google Antigravity Team
 */

// หากสร้าง Apps Script โดยตรงจาก script.google.com (Standalone Script) 
// ให้นำ ID ของ Google Sheets มาใส่ในเครื่องหมายคำพูดด้านล่าง เช่น '1BxiMVs0XRA5nFMd...' 
// (แต่ถ้าเปิดสคริปต์จากเมนู "ส่วนขยาย > Apps Script" ใน Google Sheet ปล่อยว่างไว้ได้เลยครับ)
const SPREADSHEET_ID = '13P0MQc16nLV9YXgJcMPdzkhACdOJ9Z0eC2XN9xD6_Bc';

// Global Sheet Tab Names & Drive Folder Name
const POCKETS_SHEET = 'Pockets';
const TRANSACTIONS_SHEET = 'Transactions';
const DRIVE_FOLDER_NAME = 'EmberMoney_Receipts';

/**
 * Helper to get active spreadsheet (Supports Container-bound and Standalone ID)
 */
function getSpreadsheet() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Fallback to SPREADSHEET_ID if Standalone Script
  if (!ss && SPREADSHEET_ID && SPREADSHEET_ID.trim() !== '') {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } catch (e) {
      throw new Error('ไม่พบ Google Sheet จาก ID ที่ระบุ กรุณาตรวจสอบ SPREADSHEET_ID ให้ถูกต้อง');
    }
  }

  if (!ss) {
    throw new Error('ไม่พบ Google Sheets! กรุณาเปิดสคริปต์นี้จากเมนู "ส่วนขยาย > Apps Script" ภายใน Google Sheet หรือนำ ID ของ Google Sheet มาใส่ที่ตัวแปร SPREADSHEET_ID ในโค้ด');
  }
  
  return ss;
}

/**
 * Initialize Sheets Database & Drive Folder
 * (ฟังก์ชันสำหรับกดปุ่ม "เรียกใช้ / Run" เพื่อสร้างตารางเริ่มต้น)
 */
function initDatabase() {
  const ss = getSpreadsheet();
  
  // 1. Setup Pockets Sheet
  let pocketsSheet = ss.getSheetByName(POCKETS_SHEET);
  if (!pocketsSheet) {
    pocketsSheet = ss.insertSheet(POCKETS_SHEET);
    pocketsSheet.appendRow(['ID', 'Name', 'CategoryType', 'Balance', 'TargetAmount', 'Color', 'IsLocked', 'CreatedAt']);
    
    // Seed Initial Pockets
    pocketsSheet.appendRow(['p-1', '💰 เงินออมสำรองฉุกเฉิน', 'emergency', 25000, 50000, '#16A34A', false, new Date()]);
    pocketsSheet.appendRow(['p-2', '🍱 ค่าใช้จ่ายประจำวัน', 'expense', 4200, 8000, '#C2410C', false, new Date()]);
    pocketsSheet.appendRow(['p-3', '✈️ ทริปเที่ยวญี่ปุ่น', 'trip', 12500, 35000, '#2563EB', false, new Date()]);
    pocketsSheet.appendRow(['p-4', '🏡 บ้านในฝัน (Dream House)', 'house', 450000, 1500000, '#D97706', true, new Date()]);
    pocketsSheet.appendRow(['p-5', '🛍️ ช้อปปิ้ง & ความบันเทิง', 'expense', 1800, 4000, '#8B5CF6', false, new Date()]);
  }

  // 2. Setup Transactions Sheet
  let txSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
  if (!txSheet) {
    txSheet = ss.insertSheet(TRANSACTIONS_SHEET);
    txSheet.appendRow(['ID', 'PocketID', 'PocketName', 'TargetPocketID', 'TargetPocketName', 'Type', 'Amount', 'Category', 'Note', 'ReceiptUrl', 'Date', 'CreatedAt']);
    
    // Seed Initial Transactions
    txSheet.appendRow(['t-101', 'p-2', 'ค่าใช้จ่ายประจำวัน', '', '', 'expense', 150, 'อาหาร & เครื่องดื่ม', 'ข้าวกลางวัน + กาแฟ', '', '2026-08-10', new Date()]);
    txSheet.appendRow(['t-102', 'p-1', 'เงินออมสำรองฉุกเฉิน', '', '', 'income', 5000, 'เงินออม', 'ออมประจำเดือน', '', '2026-08-01', new Date()]);
    txSheet.appendRow(['t-103', 'p-2', 'ค่าใช้จ่ายประจำวัน', 'p-3', 'ทริปเที่ยวญี่ปุ่น', 'transfer', 1000, 'โอนเงินระหว่างกระเป๋า', 'ย้ายเงินออมทริปเที่ยว', '', '2026-08-05', new Date()]);
  }

  // 3. Ensure Drive Folder Exists
  getOrCreateDriveFolder();

  Logger.log('ฐานข้อมูลและโฟลเดอร์ Google Drive พร้อมใช้งานเรียบร้อยแล้ว');
  return { success: true, message: 'ฐานข้อมูลและโฟลเดอร์ Google Drive พร้อมใช้งานเรียบร้อยแล้ว' };
}

/**
 * Get or Create Google Drive Folder for Receipts
 */
function getOrCreateDriveFolder() {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

/**
 * Handle HTTP GET Requests (Read Operations)
 */
function doGet(e) {
  try {
    const action = e?.parameter?.action || 'get_all';
    
    if (action === 'init') {
      const res = initDatabase();
      return jsonResponse(res);
    }

    const data = getAllData();
    return jsonResponse({ success: true, data: data });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Handle HTTP POST Requests (Write Operations)
 */
function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;

    if (action === 'add_transaction') {
      return jsonResponse(addTransaction(contents.payload));
    } else if (action === 'create_pocket') {
      return jsonResponse(createPocket(contents.payload));
    } else if (action === 'toggle_lock') {
      return jsonResponse(toggleLock(contents.pocket_id));
    } else if (action === 'upload_receipt') {
      return jsonResponse(uploadReceiptToDrive(contents.file_data, contents.file_name));
    }

    return jsonResponse({ success: false, error: 'ไม่พบ Action ที่ระบุ' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Read all Pockets & Transactions from Sheets
 */
function getAllData() {
  const ss = getSpreadsheet();
  
  // Pockets Data
  const pocketsSheet = ss.getSheetByName(POCKETS_SHEET);
  const pocketsData = pocketsSheet.getDataRange().getValues();
  const pockets = [];
  for (let i = 1; i < pocketsData.length; i++) {
    const row = pocketsData[i];
    if (row[0]) {
      pockets.push({
        id: String(row[0]),
        name: String(row[1]),
        category_type: String(row[2]),
        balance: Number(row[3]),
        target_amount: Number(row[4]),
        color: String(row[5]),
        is_locked: Boolean(row[6]),
        created_at: row[7]
      });
    }
  }

  // Transactions Data
  const txSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
  const txData = txSheet.getDataRange().getValues();
  const transactions = [];
  for (let i = 1; i < txData.length; i++) {
    const row = txData[i];
    if (row[0]) {
      transactions.push({
        id: String(row[0]),
        pocket_id: String(row[1]),
        pocket_name: String(row[2]),
        target_pocket_id: String(row[3]),
        target_pocket_name: String(row[4]),
        type: String(row[5]),
        amount: Number(row[6]),
        category: String(row[7]),
        note: String(row[8]),
        receipt_url: String(row[9]),
        transaction_date: String(row[10]),
        created_at: row[11]
      });
    }
  }

  return { pockets, transactions };
}

/**
 * Add Transaction (Income, Expense, Transfer) and update Pocket balances
 */
function addTransaction(payload) {
  const { pocket_id, target_pocket_id, type, amount, category, note, receipt_url } = payload;
  const ss = getSpreadsheet();
  const pocketsSheet = ss.getSheetByName(POCKETS_SHEET);
  const txSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
  
  const pocketsData = pocketsSheet.getDataRange().getValues();
  let sourceRowIndex = -1;
  let targetRowIndex = -1;

  let sourcePocket = null;
  let targetPocket = null;

  for (let i = 1; i < pocketsData.length; i++) {
    if (String(pocketsData[i][0]) === String(pocket_id)) {
      sourceRowIndex = i + 1; // 1-indexed for Sheet updates
      sourcePocket = {
        name: pocketsData[i][1],
        balance: Number(pocketsData[i][3]),
        is_locked: Boolean(pocketsData[i][6])
      };
    }
    if (target_pocket_id && String(pocketsData[i][0]) === String(target_pocket_id)) {
      targetRowIndex = i + 1;
      targetPocket = {
        name: pocketsData[i][1],
        balance: Number(pocketsData[i][3])
      };
    }
  }

  if (!sourcePocket) {
    return { success: false, message: 'ไม่พบกระเป๋าเงินต้นทาง' };
  }

  if (sourcePocket.is_locked && (type === 'expense' || type === 'transfer')) {
    return { success: false, message: `กระเป๋า "${sourcePocket.name}" ถูกล็อกอยู่ ไม่สามารถถอนหรือโอนได้` };
  }

  if ((type === 'expense' || type === 'transfer') && sourcePocket.balance < amount) {
    return { success: false, message: `ยอดเงินในกระเป๋า "${sourcePocket.name}" ไม่พอสำหรับทำรายการ` };
  }

  // Update Balances in Sheet
  if (type === 'income') {
    const newBal = sourcePocket.balance + amount;
    pocketsSheet.getRange(sourceRowIndex, 4).setValue(newBal);
  } else if (type === 'expense') {
    const newBal = sourcePocket.balance - amount;
    pocketsSheet.getRange(sourceRowIndex, 4).setValue(newBal);
  } else if (type === 'transfer') {
    if (!targetPocket || targetRowIndex === -1) {
      return { success: false, message: 'ไม่พบกระเป๋าเงินปลายทาง' };
    }
    pocketsSheet.getRange(sourceRowIndex, 4).setValue(sourcePocket.balance - amount);
    pocketsSheet.getRange(targetRowIndex, 4).setValue(targetPocket.balance + amount);
  }

  // Record Transaction
  const newTxId = 't-' + Date.now();
  const txDate = new Date().toISOString().split('T')[0];
  
  txSheet.appendRow([
    newTxId,
    pocket_id,
    sourcePocket.name,
    target_pocket_id || '',
    targetPocket ? targetPocket.name : '',
    type,
    amount,
    category,
    note || '',
    receipt_url || '',
    txDate,
    new Date()
  ]);

  return { success: true, message: 'บันทึกธุรกรรมสำเร็จเรียบร้อยแล้ว', data: getAllData() };
}

/**
 * Create New Cloud Pocket
 */
function createPocket(payload) {
  const { name, category_type, target_amount, initial_balance, color, is_locked } = payload;
  const ss = getSpreadsheet();
  const pocketsSheet = ss.getSheetByName(POCKETS_SHEET);
  
  const newId = 'p-' + Date.now();
  pocketsSheet.appendRow([
    newId,
    name,
    category_type || 'saving',
    Number(initial_balance) || 0,
    Number(target_amount) || 0,
    color || '#C2410C',
    Boolean(is_locked),
    new Date()
  ]);

  return { success: true, message: 'สร้างกระเป๋าใหม่เรียบร้อยแล้ว', data: getAllData() };
}

/**
 * Toggle Lock Status
 */
function toggleLock(pocketId) {
  const ss = getSpreadsheet();
  const pocketsSheet = ss.getSheetByName(POCKETS_SHEET);
  const data = pocketsSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(pocketId)) {
      const currentLock = Boolean(data[i][6]);
      pocketsSheet.getRange(i + 1, 7).setValue(!currentLock);
      return { success: true, message: 'อัปเดตสถานะล็อกสำเร็จ', data: getAllData() };
    }
  }
  return { success: false, message: 'ไม่พบกระเป๋าที่ระบุ' };
}

/**
 * Upload Receipt Image File to Google Drive
 */
function uploadReceiptToDrive(base64Data, fileName) {
  try {
    const folder = getOrCreateDriveFolder();
    const contentType = base64Data.substring(5, base64Data.indexOf(';'));
    const bytes = Utilities.base64Decode(base64Data.substring(base64Data.indexOf(',') + 1));
    const blob = Utilities.newBlob(bytes, contentType, fileName);
    
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return {
      success: true,
      file_url: file.getUrl(),
      file_id: file.getId()
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * JSON Response Helper
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
