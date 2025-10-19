const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

const app = express();
const PORT = 4000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/receipts', express.static('receipts'));

// Ensure directories exist
const dataDir = path.join(__dirname, 'data');
const receiptsDir = path.join(__dirname, 'receipts');
const dataFile = path.join(dataDir, 'expenses.json');

// Helper function to parse YYYY-MM-DD string as local date (not UTC)
function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Helper function to round to 2 decimal places to avoid floating point precision issues
function roundToTwo(num) {
  return Math.round(num * 100) / 100;
}

// Initialize data file if it doesn't exist
async function initializeDataFile() {
  try {
    if (!fsSync.existsSync(dataDir)) {
      await fs.mkdir(dataDir, { recursive: true });
    }
    if (!fsSync.existsSync(dataFile)) {
      await fs.writeFile(dataFile, JSON.stringify({ expenses: [] }, null, 2));
    }
    if (!fsSync.existsSync(receiptsDir)) {
      await fs.mkdir(receiptsDir, { recursive: true });
    }
  } catch (error) {
    console.error('Error initializing data file:', error);
  }
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const date = req.body.date;
    const yearMonth = date.substring(0, 7); // Get YYYY-MM
    const monthDir = path.join(receiptsDir, yearMonth);

    try {
      await fs.mkdir(monthDir, { recursive: true });
      cb(null, monthDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const date = req.body.date;
    const amount = parseFloat(req.body.amount).toFixed(2);
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const filename = `${date}_RM${amount}_${timestamp}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({ storage: storage });

// API Routes

// Get all expenses
app.get('/api/expenses', async (req, res) => {
  try {
    const data = await fs.readFile(dataFile, 'utf8');
    const expenses = JSON.parse(data);
    res.json(expenses);
  } catch (error) {
    console.error('Error reading expenses:', error);
    res.status(500).json({ error: 'Failed to read expenses' });
  }
});

// Add new expense
app.post('/api/expenses', upload.single('receipt'), async (req, res) => {
  try {
    const { date, day, amount, place } = req.body;

    // Validate place
    if (!place || place.trim() === '') {
      return res.status(400).json({ error: 'Place/Restaurant is required' });
    }

    // Validate date is weekday (Mon-Fri only)
    const expenseDate = parseLocalDate(date);
    const dayOfWeek = expenseDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return res.status(400).json({ error: 'Invalid date: meal expenses can only be claimed for Monday-Friday' });
    }

    // Validate date is not in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expenseDate > today) {
      return res.status(400).json({ error: 'Invalid date: cannot add expenses for future dates' });
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum)) {
      return res.status(400).json({ error: 'Invalid amount: must be a number' });
    }
    if (amountNum <= 0) {
      return res.status(400).json({ error: 'Invalid amount: must be greater than 0' });
    }
    // Cap individual expense at RM50 max per transaction
    const cappedAmount = amountNum > 50 ? 50 : amountNum;
    // Round to 2 decimal places to prevent precision issues
    const validAmount = Math.round(cappedAmount * 100) / 100;

    const receiptPath = req.file ? req.file.path.replace(__dirname + '/', '') : null;

    const data = await fs.readFile(dataFile, 'utf8');
    const expenses = JSON.parse(data);

    const newExpense = {
      id: Date.now().toString(),
      date,
      day,
      amount: validAmount,
      place: place.trim(),
      receiptPath,
      createdAt: new Date().toISOString()
    };

    expenses.expenses.push(newExpense);
    await fs.writeFile(dataFile, JSON.stringify(expenses, null, 2));

    res.json({ success: true, expense: newExpense });
  } catch (error) {
    console.error('Error adding expense:', error);
    res.status(500).json({ error: 'Failed to add expense' });
  }
});

// Delete expense
app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await fs.readFile(dataFile, 'utf8');
    const expenses = JSON.parse(data);

    const expenseIndex = expenses.expenses.findIndex(e => e.id === id);
    if (expenseIndex === -1) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Delete receipt file if exists
    const expense = expenses.expenses[expenseIndex];
    if (expense.receiptPath) {
      const receiptFullPath = path.join(__dirname, expense.receiptPath);
      try {
        await fs.unlink(receiptFullPath);
      } catch (err) {
        console.error('Error deleting receipt file:', err);
      }
    }

    expenses.expenses.splice(expenseIndex, 1);
    await fs.writeFile(dataFile, JSON.stringify(expenses, null, 2));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// Export to ZIP with Excel and receipts
app.get('/api/export', async (req, res) => {
  try {
    const data = await fs.readFile(dataFile, 'utf8');
    const expenses = JSON.parse(data).expenses;

    // Sort expenses by date (oldest first), then by ID (oldest first) for consistent ordering
    expenses.sort((a, b) => {
      const dateComparison = a.date.localeCompare(b.date);
      if (dateComparison !== 0) return dateComparison;
      // If dates are equal, sort by ID (which is timestamp-based)
      return Number(a.id) - Number(b.id);
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Meal Expenses');

    // Add headers
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15, style: { numFmt: 'yyyy-mm-dd' } },
      { header: 'Day', key: 'day', width: 18 },
      { header: 'Amount (RM)', key: 'amount', width: 15, style: { numFmt: '0.00' } },
      { header: 'Capped Amount (RM)', key: 'claimable', width: 15, style: { numFmt: '0.00' } },
      { header: 'Place', key: 'place', width: 40 },
      { header: 'Receipt File', key: 'receipt', width: 35 }
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };

    // Add borders to header row
    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
      };
    });

    // Add data with daily subtotals
    let currentDate = null;
    let dailyTotal = 0;
    let currentDay = null;
    let totalClaimable = 0; // Track total claimable amount across all days

    expenses.forEach((expense, index) => {
      // Add daily subtotal row when date changes
      if (currentDate && currentDate !== expense.date) {
        // Cap daily total at RM50 for claimable amount
        const claimableDaily = Math.min(dailyTotal, 50);
        totalClaimable = roundToTwo(totalClaimable + claimableDaily);

        const subtotalRow = worksheet.addRow({
          date: currentDate,
          day: 'Daily Total',
          amount: dailyTotal,
          claimable: claimableDaily,
          place: '',
          receipt: ''
        });

        subtotalRow.font = { bold: true };

        // Always use blue background for Daily Total
        subtotalRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE3F2FD' }
        };

        // If exceeds RM50, make the amount text red
        if (dailyTotal > 50) {
          const amountCell = subtotalRow.getCell(3); // Amount column
          amountCell.font = { color: { argb: 'FFFF0000' }, bold: true };
        }

        subtotalRow.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            bottom: { style: 'medium', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
          };
        });

        // Reset for new day
        dailyTotal = 0;
      }

      // Add expense row
      const row = worksheet.addRow({
        date: expense.date,
        day: expense.day,
        amount: parseFloat(expense.amount),
        claimable: '',
        place: expense.place || 'N/A',
        receipt: expense.receiptPath ? path.basename(expense.receiptPath).replace(/_\d+(\.\w+)$/, '$1') : 'N/A'
      });

      // Add borders to all cells
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
        };
      });

      // Track current date and accumulate daily total
      currentDate = expense.date;
      currentDay = expense.day;
      dailyTotal = roundToTwo(dailyTotal + parseFloat(expense.amount));
    });

    // Add final daily subtotal for the last date group
    if (currentDate) {
      // Cap daily total at RM50 for claimable amount
      const claimableDaily = Math.min(dailyTotal, 50);
      totalClaimable = roundToTwo(totalClaimable + claimableDaily);

      const subtotalRow = worksheet.addRow({
        date: currentDate,
        day: 'Daily Total',
        amount: dailyTotal,
        claimable: claimableDaily,
        place: '',
        receipt: ''
      });

      subtotalRow.font = { bold: true };

      // Always use blue background for Daily Total
      subtotalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE3F2FD' }
      };

      // If exceeds RM50, make the amount text red
      if (dailyTotal > 50) {
        const amountCell = subtotalRow.getCell(3); // Amount column
        amountCell.font = { color: { argb: 'FFFF0000' }, bold: true };
      }

      subtotalRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          bottom: { style: 'medium', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
        };
      });
    }

    // Add total row
    const totalRow = worksheet.addRow({
      date: 'TOTAL',
      day: '',
      amount: '',
      claimable: totalClaimable,
      place: '',
      receipt: ''
    });
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFEB9C' }
    };

    // Add thick top border to TOTAL row for separation
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
      };
    });

    // Add note explaining the cap
    worksheet.addRow({});
    const noteRow = worksheet.addRow({
      date: '',
      day: '* Daily claims are capped at RM50.00',
      amount: '',
      claimable: '',
      place: '',
      receipt: ''
    });
    noteRow.font = { italic: true, size: 10 };
    noteRow.getCell(2).alignment = { horizontal: 'left' };

    // Apply number format to all amount cells (column 3)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) { // Skip header row
        const amountCell = row.getCell(3);
        amountCell.numFmt = '0.00';
      }
    });

    // Apply Excel best practices
    // 1. Freeze header row (keep it visible when scrolling)
    worksheet.views = [
      { state: 'frozen', xSplit: 0, ySplit: 1 }
    ];

    // 2. Enable auto-filter on header row
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 6 }
    };

    // Generate Excel buffer
    const excelBuffer = await workbook.xlsx.writeBuffer();

    // Create ZIP
    const zip = new JSZip();

    // Add Excel to ZIP (use local date for filename)
    const now = new Date();
    const today = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    zip.file(`meal-expenses-${today}.xlsx`, excelBuffer);

    // Add receipts folder with all images
    const receiptsFolder = zip.folder('receipts');
    for (const expense of expenses) {
      if (expense.receiptPath) {
        try {
          const receiptFullPath = path.join(__dirname, expense.receiptPath);
          const receiptData = await fs.readFile(receiptFullPath);
          receiptsFolder.file(path.basename(expense.receiptPath), receiptData);
        } catch (err) {
          console.error(`Error reading receipt ${expense.receiptPath}:`, err);
        }
      }
    }

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // Send ZIP file
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=meal-expenses-${today}.zip`);
    res.send(zipBuffer);

  } catch (error) {
    console.error('Error exporting:', error);
    res.status(500).json({ error: 'Failed to export' });
  }
});

// Start server
initializeDataFile().then(() => {
  app.listen(PORT, () => {
    console.log(`Meal Expense Tracker running at http://localhost:${PORT}`);
  });
});