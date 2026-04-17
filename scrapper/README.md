# BNI Connect Data Extractor (Premium Edition)

A professional, background-safe web scraper for BNI Connect, designed to extract member data efficiently with a real-time UI and parallel processing.

## 🚀 How to Use

1.  **Open BNI Connect**: Log in to your BNI Search page.
2.  **Search**: Enter your search query (e.g., by Keyword/City) and run the search.
3.  **Open Console**: Right-click anywhere on the page, select **Inspect**, and click the **Console** tab.
4.  **Copy & Paste**: Open `scraper.js` from this folder, copy the entire code, paste it into the console, and hit **Enter**.
5.  **Authorize Wake Lock**: Click *anywhere* on the BNI webpage immediately after pressing enter. This allows the browser to keep your screen awake.
6.  **Sit Back & Relax**: The floating UI panel will show you the progress in real-time. You can pause, stop, or download the CSV at any time.

---

## ✨ Key Features (v15)

*   **Floating UI Panel**: Monitor discovery, scraping progress, speed, and ETA in real-time.
*   **Background-Safe**: Uses Web Worker timers so the scraper won't be throttled if you switch tabs or minimize the window.
*   **Parallel Scraping**: Optimized concurrency to speed up data extraction.
*   **Auto-Rescue**: Detected logouts or session timeouts and automatically triggers a save of your current progress.
*   **Resume Capability**: Found a saved session? The scraper will ask if you want to resume where you left off.
*   **Clean Export**: Properly escaped CSV format, ready for Excel or Zoho CRM.

---

## 📜 Version History (Evolution)

| Version | Name | Key Improvements |
| :--- | :--- | :--- |
| **v15** | **Background Edition** | **Final consolidated version.** Added real-time UI Panel, Web Worker timers for background safety, parallelism, and session resume. |
| **v12/13** | **Unbreakable** | Introduced logout detection (Auto-Rescue) and safe Wake Lock to keep the system awake. |
| **v10** | **Master Edition** | Shifted to full profile page extraction using MUI `aria-labels` for high precision (Email, Website, Category, etc.). |
| **v9** | **Capture-While-Scroll** | Optimized discovery to capture member links while scrolling to handle virtual-list rendering. |
| **v8** | **Auto-Scroll** | First version to automate the scrolling process to load all members in a search result. |

---

## 📂 Folder Structure

*   `scraper.js`: The main automation script.
*   `README.md`: This file (Instructions & History).

> [!TIP]
> To ensure maximum speed, keep the BNI tab in its own window. While v15 is background-safe, browsers still prioritize active windows!
