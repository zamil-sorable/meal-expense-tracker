// DOM Elements
const expenseForm = document.getElementById('expenseForm');
const expensesBody = document.getElementById('expensesBody');
const exportBtn = document.getElementById('exportBtn');
const receiptModal = document.getElementById('receiptModal');
const receiptImage = document.getElementById('receiptImage');
const closeModal = document.querySelector('.close');
const fileUploadZone = document.getElementById('fileUploadZone');
const fileInput = document.getElementById('receipt');
const fileUploadContent = document.getElementById('fileUploadContent');
const filePreview = document.getElementById('filePreview');
const previewImage = document.getElementById('previewImage');
const removeFileBtn = document.getElementById('removeFileBtn');
const holidayForm = document.getElementById('holidayForm');
const holidaysBody = document.getElementById('holidaysBody');

// Helper function to get local date string in YYYY-MM-DD format
function getLocalDateString() {
  const today = new Date();
  return today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');
}

// Helper function to parse YYYY-MM-DD string as local date (not UTC)
function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Helper function to round to 2 decimal places to avoid floating point precision issues
function roundToTwo(num) {
  return Math.round(num * 100) / 100;
}

// Set default date to today (in local timezone)
document.getElementById('date').value = getLocalDateString();

// Auto-set day based on date
function setDayFromDate(dateValue) {
  const date = parseLocalDate(dateValue);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[date.getDay()];
  document.getElementById('day').value = dayName;
  document.getElementById('dayBadge').textContent = dayName;
}

// Set day on page load
setDayFromDate(getLocalDateString());

// Auto-update day when date changes and validate weekday
document.getElementById('date').addEventListener('change', function() {
  const selectedDate = parseLocalDate(this.value);
  const dayOfWeek = selectedDate.getDay();

  // Check if weekend (0 = Sunday, 6 = Saturday)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    showToast('Invalid Date', 'Meal expenses can only be claimed for Monday-Friday', 'error');
    this.value = getLocalDateString(); // Reset to today
    setDayFromDate(getLocalDateString());
    return;
  }

  setDayFromDate(this.value);
});

// Toast Notification System
function showToast(title, message, type = 'info') {
  const toastContainer = document.getElementById('toastContainer');

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconMap = {
    success: 'check-circle',
    error: 'alert-circle',
    info: 'info'
  };

  toast.innerHTML = `
    <div class="toast-icon">
      <i data-lucide="${iconMap[type]}"></i>
    </div>
    <div class="toast-content">
      <p class="toast-title">${title}</p>
      ${message ? `<p class="toast-message">${message}</p>` : ''}
    </div>
    <button class="toast-close">
      <i data-lucide="x"></i>
    </button>
  `;

  toastContainer.appendChild(toast);
  lucide.createIcons();

  // Close button handler
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => removeToast(toast));

  // Auto remove after 4 seconds
  setTimeout(() => removeToast(toast), 4000);
}

function removeToast(toast) {
  toast.classList.add('hiding');
  setTimeout(() => {
    if (toast.parentElement) {
      toast.parentElement.removeChild(toast);
    }
  }, 300);
}

// File Upload - Drag and Drop
fileUploadZone.addEventListener('click', () => {
  fileInput.click();
});

fileUploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileUploadZone.classList.add('drag-over');
});

fileUploadZone.addEventListener('dragleave', () => {
  fileUploadZone.classList.remove('drag-over');
});

fileUploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  fileUploadZone.classList.remove('drag-over');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    fileInput.files = files;
    handleFileSelect(files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFileSelect(e.target.files[0]);
  }
});

function handleFileSelect(file) {
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;
      fileUploadContent.style.display = 'none';
      filePreview.style.display = 'block';
      lucide.createIcons();
    };
    reader.readAsDataURL(file);
  }
}

removeFileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.value = '';
  previewImage.src = '';
  fileUploadContent.style.display = 'flex';
  filePreview.style.display = 'none';
  lucide.createIcons();
});

// Initialize
loadExpenses();
loadHolidays();

// Form submission
expenseForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(expenseForm);

  try {
    const response = await fetch('/api/expenses', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      showToast('Success!', 'Expense added successfully', 'success');
      expenseForm.reset();
      document.getElementById('date').value = getLocalDateString();
      setDayFromDate(getLocalDateString()); // Update day badge to match today

      // Reset file upload UI
      fileInput.value = '';
      previewImage.src = '';
      fileUploadContent.style.display = 'flex';
      filePreview.style.display = 'none';

      loadExpenses();
      lucide.createIcons();
    } else {
      showToast('Error', result.error || 'Failed to add expense', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error', 'Failed to add expense', 'error');
  }
});

// Load expenses
async function loadExpenses() {
  try {
    const response = await fetch('/api/expenses');
    const data = await response.json();
    const expenses = data.expenses || [];

    displayExpenses(expenses);
    updateSummary(expenses);
  } catch (error) {
    console.error('Error loading expenses:', error);
    showToast('Error', 'Failed to load expenses', 'error');
  }
}

// Display expenses in table
function displayExpenses(expenses) {
  if (expenses.length === 0) {
    expensesBody.innerHTML = '<tr><td colspan="6" class="no-data">No expenses added yet</td></tr>';
    return;
  }

  // Sort by date (newest first), then by creation time (newest first)
  expenses.sort((a, b) => {
    const dateComparison = new Date(b.date) - new Date(a.date);
    if (dateComparison !== 0) return dateComparison;
    // If dates are equal, sort by ID (which is timestamp-based)
    return Number(b.id) - Number(a.id);
  });

  expensesBody.innerHTML = expenses.map(expense => `
    <tr>
      <td>${expense.date}</td>
      <td>${expense.day}</td>
      <td>RM ${expense.amount.toFixed(2)}</td>
      <td>${expense.place || 'N/A'}</td>
      <td>
        ${expense.receiptPath
          ? `<img src="/${expense.receiptPath}" alt="Receipt" class="receipt-thumbnail" onclick="showReceipt('/${expense.receiptPath}')">`
          : 'N/A'}
      </td>
      <td>
        <button class="btn btn-danger" onclick="deleteExpense('${expense.id}')">
          <i data-lucide="trash-2"></i>
          <span>Delete</span>
        </button>
      </td>
    </tr>
  `).join('');

  // Re-initialize icons after updating DOM
  lucide.createIcons();
}

// Update summary cards and progress bar
function updateSummary(expenses) {
  const today = getLocalDateString();
  const todayExpenses = expenses.filter(e => e.date === today);
  const todayTotal = roundToTwo(todayExpenses.reduce((sum, e) => sum + e.amount, 0));

  // Get start of current week (Monday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek; // Adjust to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  // Format monday as YYYY-MM-DD string for comparison
  const mondayString = monday.getFullYear() + '-' +
    String(monday.getMonth() + 1).padStart(2, '0') + '-' +
    String(monday.getDate()).padStart(2, '0');

  const weekExpenses = expenses.filter(e => e.date >= mondayString && e.date <= today);
  const weekTotal = roundToTwo(weekExpenses.reduce((sum, e) => sum + e.amount, 0));

  // Get current month (in local timezone)
  const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const monthExpenses = expenses.filter(e => e.date.startsWith(currentMonth) && e.date <= today);
  const monthTotal = roundToTwo(monthExpenses.reduce((sum, e) => sum + e.amount, 0));

  // Overall total
  const overallTotal = roundToTwo(expenses.reduce((sum, e) => sum + e.amount, 0));

  // Update daily limit progress bar
  const dailyLimit = 50;
  const percentage = Math.min((todayTotal / dailyLimit) * 100, 100);
  const remaining = Math.max(dailyLimit - todayTotal, 0);

  const progressFill = document.getElementById('progressFill');
  progressFill.style.width = `${percentage}%`;

  // Change color based on usage
  progressFill.classList.remove('warning', 'danger');
  if (percentage >= 90) {
    progressFill.classList.add('danger');
  } else if (percentage >= 70) {
    progressFill.classList.add('warning');
  }

  const claimableAmount = Math.min(todayTotal, dailyLimit);
  document.getElementById('todayAmount').textContent = `RM ${todayTotal.toFixed(2)}`;
  document.getElementById('remainingText').textContent =
    todayTotal > dailyLimit
      ? `Can only claim RM ${dailyLimit.toFixed(2)} (RM ${(todayTotal - dailyLimit).toFixed(2)} over limit)`
      : `RM ${remaining.toFixed(2)} remaining`;

  document.getElementById('weekTotal').textContent = `RM ${weekTotal.toFixed(2)}`;
  document.getElementById('monthTotal').textContent = `RM ${monthTotal.toFixed(2)}`;
  document.getElementById('overallTotal').textContent = `RM ${overallTotal.toFixed(2)}`;
}

// Delete expense
async function deleteExpense(id) {
  if (!confirm('Are you sure you want to delete this expense?')) {
    return;
  }

  try {
    const response = await fetch(`/api/expenses/${id}`, {
      method: 'DELETE'
    });

    const result = await response.json();

    if (result.success) {
      showToast('Deleted', 'Expense deleted successfully', 'success');
      loadExpenses();
    } else {
      showToast('Error', result.error || 'Failed to delete expense', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error', 'Failed to delete expense', 'error');
  }
}

// Show receipt in modal
function showReceipt(path) {
  receiptImage.src = path;
  receiptModal.style.display = 'block';
}

// Close modal
closeModal.onclick = function() {
  receiptModal.style.display = 'none';
}

window.onclick = function(event) {
  if (event.target === receiptModal) {
    receiptModal.style.display = 'none';
  }
}

// Export to ZIP
exportBtn.addEventListener('click', async () => {
  try {
    showToast('Exporting...', 'Preparing your export file', 'info');

    const response = await fetch('/api/export');

    if (!response.ok) {
      throw new Error('Export failed');
    }

    // Get the blob
    const blob = await response.blob();

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Get filename from Content-Disposition header or use default
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'meal-expenses.zip';
    if (contentDisposition) {
      const matches = /filename=([^;]+)/.exec(contentDisposition);
      if (matches && matches[1]) {
        filename = matches[1];
      }
    }

    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showToast('Success!', 'Export completed successfully', 'success');
  } catch (error) {
    console.error('Error exporting:', error);
    showToast('Error', 'Failed to export data', 'error');
  }
});

// Holiday Management Functions

// Load holidays
async function loadHolidays() {
  try {
    const response = await fetch('/api/holidays');
    const data = await response.json();
    const holidays = data.holidays || [];
    displayHolidays(holidays);
  } catch (error) {
    console.error('Error loading holidays:', error);
    showToast('Error', 'Failed to load holidays', 'error');
  }
}

// Display holidays in table
function displayHolidays(holidays) {
  if (holidays.length === 0) {
    holidaysBody.innerHTML = '<tr><td colspan="4" class="no-data">No public holidays added yet</td></tr>';
    return;
  }

  // Sort by date (oldest first)
  holidays.sort((a, b) => a.date.localeCompare(b.date));

  holidaysBody.innerHTML = holidays.map(holiday => `
    <tr>
      <td>${holiday.date}</td>
      <td>${getDayName(holiday.date)}</td>
      <td>${holiday.name}</td>
      <td>
        <button class="btn btn-danger" onclick="deleteHoliday('${holiday.id}')">
          <i data-lucide="trash-2"></i>
          <span>Delete</span>
        </button>
      </td>
    </tr>
  `).join('');

  // Re-initialize icons after updating DOM
  lucide.createIcons();
}

// Helper function to get day name (for holiday display)
function getDayName(dateString) {
  const date = parseLocalDate(dateString);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

// Holiday form submission
holidayForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = {
    date: document.getElementById('holidayDate').value,
    name: document.getElementById('holidayName').value
  };

  try {
    const response = await fetch('/api/holidays', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });

    const result = await response.json();

    if (result.success) {
      showToast('Success!', 'Public holiday added successfully', 'success');
      holidayForm.reset();
      loadHolidays();
    } else {
      showToast('Error', result.error || 'Failed to add holiday', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error', 'Failed to add holiday', 'error');
  }
});

// Delete holiday
async function deleteHoliday(id) {
  if (!confirm('Are you sure you want to delete this public holiday?')) {
    return;
  }

  try {
    const response = await fetch(`/api/holidays/${id}`, {
      method: 'DELETE'
    });

    const result = await response.json();

    if (result.success) {
      showToast('Deleted', 'Public holiday deleted successfully', 'success');
      loadHolidays();
    } else {
      showToast('Error', result.error || 'Failed to delete holiday', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error', 'Failed to delete holiday', 'error');
  }
}