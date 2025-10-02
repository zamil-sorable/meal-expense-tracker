# Meal Expense Tracker

A simple local web app to track your daily meal expenses with receipt management and Excel export functionality.

## Features

- ✅ Add meal expenses with date, day, amount, and receipt photo
- ✅ Automatic receipt photo organization by month
- ✅ View summary: Today, This Week, This Month, Total
- ✅ Daily limit warning (RM50/day for Mon-Fri)
- ✅ View receipt photos in modal
- ✅ Delete expenses
- ✅ Export to ZIP file (Excel + all receipt images)
- ✅ All data stored locally on your Mac

## Setup Instructions

### 1. Open the project in VS Code

```bash
cd /Users/zamil/Work/meal-expense-tracker
code .
```

### 2. Install dependencies

Open the terminal in VS Code (Terminal → New Terminal) and run:

```bash
npm install
```

This will install all required packages (Express, Multer, ExcelJS, JSZip).

### 3. Start the app

```bash
npm start
```

You should see:
```
Meal Expense Tracker running at http://localhost:3000
```

### 4. Open in browser

Go to: **http://localhost:3000**

## How to Use

### Adding an Expense

1. **Date**: Select the date of your meal (defaults to today)
2. **Day**: Automatically fills based on the date you select
3. **Amount**: Enter the meal cost in RM (max RM50/day)
4. **Receipt Photo**: Upload a photo of your receipt
5. Click **Add Expense**

The app will automatically:
- Rename your receipt to: `YYYY-MM-DD_RM[amount].jpg`
- Store it in: `receipts/YYYY-MM/` folder
- Save the entry to the database

### Viewing Expenses

- All expenses are displayed in the table (newest first)
- Click **View Receipt** to see the receipt photo in a popup
- Summary cards show totals for Today/Week/Month/Overall

### Deleting an Expense

Click the **Delete** button next to any expense (also removes the receipt photo).

### Exporting for Submission

1. Click **Export to ZIP** button
2. A ZIP file will be downloaded: `meal-expenses-YYYY-MM-DD.zip`
3. The ZIP contains:
   - Excel spreadsheet with all your expenses
   - `receipts/` folder with all receipt photos

4. Email this ZIP file to Joice

## File Structure

```
meal-expense-tracker/
├── package.json           # Dependencies
├── server.js              # Backend server
├── public/                # Frontend files
│   ├── index.html         # Main UI
│   ├── style.css          # Styling
│   └── app.js             # Frontend logic
├── data/
│   └── expenses.json      # Stored expense data
└── receipts/              # Receipt photos (organized by month)
    ├── 2025-10/
    ├── 2025-11/
    └── ...
```

## Tips

- The app automatically prevents you from selecting weekend days (Sat/Sun)
- Daily total turns red if you exceed RM50
- All data is stored locally - nothing is sent to the internet
- Keep the terminal/server running while using the app
- To stop the app: Press `Ctrl+C` in the terminal

## Requirements

- Node.js (already installed on your Mac)
- Modern web browser (Chrome, Safari, Firefox)

## Troubleshooting

**Port already in use?**
If port 3000 is already taken, edit `server.js` and change:
```javascript
const PORT = 3000; // Change to 3001, 3002, etc.
```

**Can't upload images?**
Make sure the `receipts/` folder has write permissions.

## Support

For issues or questions, check the server terminal for error messages.