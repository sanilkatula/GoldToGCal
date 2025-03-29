// UCSB API key
const apiKey = "qUxfl5RG8MXSR1pAMgbHlDhl7QEzUROu";

// Converts quarter label into api format quarter label
function getApiQuarterCode(quarterLabel) {
  const parts = quarterLabel.split(" ");
  if (parts.length < 2) return null;
  const season = parts[0].toLowerCase();
  const year = parts[1];
  const seasonCodeMap = { winter: "1", spring: "2", summer: "3", fall: "4" };
  const code = seasonCodeMap[season];
  if (!code) return null;
  return year + code;
}

// Async function to fetch quarter data from the UCSB API
const fetchQuarterData = async (apiQuarterCode) => {
  const url = `https://api.ucsb.edu/academics/quartercalendar/v1/quarters?quarter=${encodeURIComponent(apiQuarterCode)}`;
  const response = await fetch(url, {
    headers: { "ucsb-api-key": apiKey },
  });
  if (!response.ok) {
    console.error(`API error: ${response.status} - ${response.statusText}`);
    throw new Error(`API error: ${response.status}`);
  }
  const data = await response.json();
  const quarterData = data.find(q => q.quarter === apiQuarterCode);
  if (!quarterData) {
    throw new Error(`Quarter ${apiQuarterCode} not found in response`);
  }
  return quarterData;
};

// Extract quarter info from the page and fetch API data
const getQuarterInfo = async () => {
  const quarterLabelEl = document.getElementById("pageContent_quarterLabel");
  if (!quarterLabelEl) {
    console.error("Quarter label element not found on page.");
    return null;
  }
  const quarterLabel = quarterLabelEl.innerText.trim(); 
  const apiQuarterCode = getApiQuarterCode(quarterLabel);
  if (!apiQuarterCode) {
    console.error("Failed to convert quarter label to API code:", quarterLabel);
    return null;
  }
  try {
    const quarterData = await fetchQuarterData(apiQuarterCode);
    return { quarter: quarterLabel, quarterData };
  } catch (err) {
    console.error("Error fetching quarter data:", err);
    return null;
  }
};

window.addEventListener("load", () => {
  if (
    window.location.href.includes("WeeklyStudentSchedule.aspx") ||
    window.location.href.includes("WeeklyCartSchedule.aspx")
  ) {

    // --- Helper Functions ---
    function pad(number) {
      return number < 10 ? '0' + number : number;
    }

    function convertTo24Hour(timeStr) {
      let [time, modifier] = timeStr.split(' ');
      let [hours, minutes] = time.split(':');
      if (hours === "12") {
        hours = modifier === "AM" ? "00" : "12";
      } else {
        hours = modifier === "PM" ? String(parseInt(hours, 10) + 12) : hours;
      }
      return `${pad(hours)}:${pad(minutes)}:00`;
    }

    // Finds the first occurrence of the given day from the quarter start date.
    function getFirstOccurrenceDate(dayLetter, quarterStartDate) {
      const dayMap = { "M": 1, "T": 2, "W": 3, "R": 4, "F": 5, "S": 6, "U": 0 };
      const targetDay = dayMap[dayLetter];
      if (targetDay === undefined) {
        console.error("Invalid day letter:", dayLetter);
        return new Date(quarterStartDate);
      }
      let firstDate = new Date(quarterStartDate);
      let safetyCounter = 0;
      while (firstDate.getDay() !== targetDay && safetyCounter < 7) {
        firstDate.setDate(firstDate.getDate() + 1);
        safetyCounter++;
      }
      if (safetyCounter === 7) {
        console.warn("Could not find matching day for", dayLetter, "using quarterStartDate as fallback.");
        return new Date(quarterStartDate);
      }
      return firstDate;
    }

    // Formats a Date object and a 24-hour time string for ICS (YYYYMMDDTHHmmss)
    function formatDateForICS(dateObj, timeStr) {
      const year = dateObj.getFullYear();
      const month = pad(dateObj.getMonth() + 1);
      const day = pad(dateObj.getDate());
      const timePart = timeStr.replace(/:/g, '');
      return `${year}${month}${day}T${timePart}`;
    }

    function generateUID() {
      return Date.now() + '-' + Math.floor(Math.random() * 100000);
    }

    // Generate the ICS file content for all events.
    function generateICS(events, quarterStartDate, quarterEndDate) {
      let icsContent = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//GOLD Schedule Export//EN\r\n";
      
      icsContent += "BEGIN:VTIMEZONE\r\n";
      icsContent += "TZID:America/Los_Angeles\r\n";
      icsContent += "X-LIC-LOCATION:America/Los_Angeles\r\n";
      icsContent += "BEGIN:STANDARD\r\n";
      icsContent += "TZOFFSETFROM:-0700\r\n";
      icsContent += "TZOFFSETTO:-0800\r\n";
      icsContent += "TZNAME:PST\r\n";
      icsContent += "DTSTART:19701101T020000\r\n";
      icsContent += "END:STANDARD\r\n";
      icsContent += "BEGIN:DAYLIGHT\r\n";
      icsContent += "TZOFFSETFROM:-0800\r\n";
      icsContent += "TZOFFSETTO:-0700\r\n";
      icsContent += "TZNAME:PDT\r\n";
      icsContent += "DTSTART:19700308T020000\r\n";
      icsContent += "END:DAYLIGHT\r\n";
      icsContent += "END:VTIMEZONE\r\n";
    
      events.forEach(event => {
        const firstDate = getFirstOccurrenceDate(event.day, quarterStartDate);
        const startTime = convertTo24Hour(event.start);
        const endTime = convertTo24Hour(event.end);
        const dtStart = formatDateForICS(firstDate, startTime);
        const dtEnd = formatDateForICS(firstDate, endTime);
        const untilStr = quarterEndDate.getFullYear() +
                         pad(quarterEndDate.getMonth() + 1) +
                         pad(quarterEndDate.getDate()) +
                         "T000000Z";
        const rrule = "RRULE:FREQ=WEEKLY;BYDAY=" + event.day + ";UNTIL=" + untilStr;
        
        icsContent += "BEGIN:VEVENT\r\n";
        icsContent += "UID:" + generateUID() + "\r\n";
        icsContent += "SUMMARY:" + event.course + "\r\n";
        icsContent += "LOCATION:" + event.location + "\r\n";
        icsContent += "DTSTART;TZID=America/Los_Angeles:" + dtStart + "\r\n";
        icsContent += "DTEND;TZID=America/Los_Angeles:" + dtEnd + "\r\n";
        icsContent += rrule + "\r\n";
        icsContent += "END:VEVENT\r\n";
      });
      
      icsContent += "END:VCALENDAR";
      return icsContent;
    }
      
    function downloadICS(icsContent) {
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'schedule.ics';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    
    // Scrape schedule events; if data-day is missing, derive it from parent container's id.
    function scrapeSchedule() {
      const scheduleData = [];
      document.querySelectorAll("li.single-event").forEach(eventEl => {
        let day = eventEl.getAttribute("data-day");
        if (!day || day.trim() === "") {
          const groupEl = eventEl.closest(".events-group");
          if (groupEl && groupEl.id) {
            day = groupEl.id.slice(-1);
          }
        }
        day = day.trim().toUpperCase();
        
        const start = eventEl.getAttribute("data-start") || "";
        const end = eventEl.getAttribute("data-end") || "";
        const course = eventEl.querySelector(".event-name")?.textContent.trim() || "Course";
        const location = eventEl.querySelector(".event-location")?.textContent.trim() || "Location";
        scheduleData.push({ day, start, end, course, location });
      });
      return scheduleData;
    }

    // --- Create a Preview Modal ---
    // The modal includes three buttons: "Download ICS" and "Add to Google Calendar" and "Cancel"
    function createPreviewModal(events, quarterInfo) {

        //  modal overlay using a class that matches the site's style.
        const modalOverlay = document.createElement("div");
        modalOverlay.id = "schedule-modal";
        modalOverlay.className = "modal-overlay"; // Define this class in your CSS.
      
        //  modal content container using the website's container classes.
        const modalContent = document.createElement("div");
        modalContent.className = "modal-content container template-primary"; // Using site classes.

        // header title with the same classes as the site's page titles.
        const title = document.createElement("h2");
        title.className = "page-title";
        title.innerText = "Your Schedule Preview";

        modalContent.appendChild(title);
      
        // Quarter Info 
        if (quarterInfo) {
          const quarterDiv = document.createElement("div");
          quarterDiv.className = "quarter-info"; 
          quarterDiv.innerHTML = `
                                  <strong>Schedule for:</strong> ${quarterInfo.quarter}<br>
                                  <strong>First Day of Classes:</strong> ${quarterInfo.quarterData.firstDayOfClasses.slice(0, 10)}<br>
                                  <strong>Last Day of Classes:</strong> ${quarterInfo.quarterData.lastDayOfClasses.slice(0, 10) || "N/A"}`;
          modalContent.appendChild(quarterDiv);
        }
      
        //  a table for schedule events.
        const table = document.createElement("table");
        table.className = "table table-striped";
      
        //  table header row.
        const headerRow = document.createElement("tr");
        ["Day", "Start", "End", "Course", "Location"].forEach(text => {
          const th = document.createElement("th");
          th.innerText = text;
          headerRow.appendChild(th);
        });
        table.appendChild(headerRow);
      
        // Populate table rows with events.
        events.forEach(event => {
          const row = document.createElement("tr");
      
          ["day", "start", "end", "course", "location"].forEach(key => {
            const cell = document.createElement("td");
            cell.innerText = event[key];
            row.appendChild(cell);
          });
      
          table.appendChild(row);
        });
        modalContent.appendChild(table);
      
        const buttonContainer = document.createElement("div");
        buttonContainer.className = "button-container"; 
      
        const downloadBtn = document.createElement("button");
        downloadBtn.innerText = "Download ICS";
        downloadBtn.className = "gold-button";
        buttonContainer.appendChild(downloadBtn);
      
        const addGCalBtn = document.createElement("button");
        addGCalBtn.innerText = "Add to Google Calendar";
        addGCalBtn.className = "gold-button";
        buttonContainer.appendChild(addGCalBtn);
      
        const cancelBtn = document.createElement("button");
        cancelBtn.innerText = "Cancel";
        cancelBtn.className = "gold-button";
        buttonContainer.appendChild(cancelBtn);
      
        modalContent.appendChild(buttonContainer);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);
      
        downloadBtn.addEventListener("click", () => {
          let quarterStartDate, quarterEndDate;
          if (quarterInfo && quarterInfo.quarterData) {
            quarterStartDate = new Date(quarterInfo.quarterData.firstDayOfClasses);
            quarterEndDate = new Date(quarterInfo.quarterData.lastDayOfClasses || "2025-06-08");
          } else {
            quarterStartDate = new Date("2025-03-31");
            quarterEndDate = new Date("2025-06-08");
          }
          const icsContent = generateICS(events, quarterStartDate, quarterEndDate);
          downloadICS(icsContent);
          alert("ICS file generated and downloaded! Import it into your calendar.");
          document.body.removeChild(modalOverlay);
        });
      
        addGCalBtn.addEventListener("click", () => {
            // Remove the preview modal if it's still on the page.
            if (modalOverlay && document.body.contains(modalOverlay)) {
              document.body.removeChild(modalOverlay);
            }
            
            // Create an overlay for the loader using the modal-overlay class.
            const loaderOverlay = document.createElement("div");
            loaderOverlay.id = "loader-overlay";
            loaderOverlay.className = "modal-overlay";
            
            // Create the loader container.
            const loaderContainer = document.createElement("div");
            loaderContainer.id = "loader-container";
            loaderContainer.className = "loader-container";
            
            // --- Spinner (Centered) ---
            const spinner = document.createElement("div");
            spinner.id = "loading-spinner";
            spinner.innerHTML = `<div class="spinner"></div>`;
            loaderContainer.appendChild(spinner);
            
            // --- Progress Bar (Below Spinner) ---
            const progressBar = document.createElement("progress");
            progressBar.id = "loader-progress";
            progressBar.max = events.length;
            progressBar.value = 0;
            progressBar.style.width = "100%";
            progressBar.style.margin = "15px 0";
            loaderContainer.appendChild(progressBar);
            
            // --- Status Text ---
            const statusText = document.createElement("div");
            statusText.id = "loading-status";
            statusText.className = "loading-status";
            statusText.innerText = "Making a calendar...";
            loaderContainer.appendChild(statusText);
            
            // --- Courses Table ---
            const coursesTable = document.createElement("table");
            coursesTable.id = "courses-table";
            coursesTable.style.marginTop = "15px";
            // --- Table header ---
            const tableHeader = document.createElement("thead");
            tableHeader.innerHTML = `<tr>
                <th style="padding:8px; border:1px solid #ddd;">Course</th>
                <th style="padding:8px; border:1px solid #ddd;">Status</th>
              </tr>`;
            coursesTable.appendChild(tableHeader);
            // --- Table body ---
            const tableBody = document.createElement("tbody");
            events.forEach(event => {
              const tr = document.createElement("tr");
              const tdCourse = document.createElement("td");
              tdCourse.innerText = event.course;
              tdCourse.style.padding = "8px";
              tdCourse.style.border = "1px solid #ddd";
              const tdStatus = document.createElement("td");
              tdStatus.innerText = "In Progress";
              tdStatus.style.padding = "8px";
              tdStatus.style.border = "1px solid #ddd";
              tdStatus.style.color = "orange";
              tr.appendChild(tdCourse);
              tr.appendChild(tdStatus);
              tableBody.appendChild(tr);
            });
            coursesTable.appendChild(tableBody);
            loaderContainer.appendChild(coursesTable);
            
            // Append the loader container to the overlay, then to the document body.
            loaderOverlay.appendChild(loaderContainer);
            document.body.appendChild(loaderOverlay);
            
            // --- Inject Spinner CSS  ---
            if (!document.getElementById("spinner-style")) {
              const style = document.createElement("style");
              style.id = "spinner-style";
              style.innerHTML = `
                .spinner {
                  border: 8px solid #f3f3f3;
                  border-top: 8px solid #3498db;
                  border-radius: 50%;
                  width: 60px;
                  height: 60px;
                  animation: spin 2s linear infinite;
                }
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `;
              document.head.appendChild(style);
            }
            
            // --- Determine Quarter Dates ---
            let quarterStartDate, quarterEndDate;
            if (quarterInfo && quarterInfo.quarterData) {
              quarterStartDate = new Date(quarterInfo.quarterData.firstDayOfClasses);
              quarterEndDate = new Date(quarterInfo.quarterData.lastDayOfClasses || "2025-06-08");
            } else {
              quarterStartDate = new Date("2025-03-31");
              quarterEndDate = new Date("2025-06-08");
            }
            
            const payload = {
              events,
              quarterStart: quarterStartDate.toISOString(),
              quarterEnd: quarterEndDate.toISOString(),
              calendarSummary: `${quarterInfo ? quarterInfo.quarter : "Quarter"} Schedule`
            };
            
            // --- Send Payload to Background Script ---
            chrome.runtime.sendMessage({ action: "ADD_TO_GCAL", payload }, (response) => {
              let courseIndex = 0;
              function updateNextCourse() {
                if (courseIndex < tableBody.children.length) {
                  const row = tableBody.children[courseIndex];
                  const statusCell = row.children[1];
                  statusCell.innerHTML = `Added <span style="color:green;">&#10004;</span>`;
                  statusCell.style.color = "green";
                  progressBar.value = courseIndex + 1;
                  courseIndex++;
                  setTimeout(updateNextCourse, 500);
                } else {
                  if (spinner && spinner.parentNode) {
                    spinner.parentNode.removeChild(spinner);
                  }
                  statusText.innerHTML = `All courses added!`;

                  setTimeout(() => {
                    if (document.getElementById("loader-overlay")) {
                      document.body.removeChild(loaderOverlay);
                    }
                    if (response && response.error) {
                      alert("Error adding to Google Calendar: " + response.error);
                    } else if (response && response.success) {
                      alert("Events added to your Google Calendar! Calendar ID: " + response.calendarId);
                    }
                  }, 1500);
                }
              }
              updateNextCourse();
            });
          });          
          
        // "Cancel" button handler.
        cancelBtn.addEventListener("click", () => {
          document.body.removeChild(modalOverlay);
        });
    
    }      

    // --- Gcal Button ---
    const bigRedButton = document.createElement("a");
    bigRedButton.innerText = "Convert to GCal";
    bigRedButton.href = "#"; 
    bigRedButton.classList.add("gold-button");

    bigRedButton.addEventListener("click", async (e) => {
    e.preventDefault();
    const events = scrapeSchedule();
    if (events.length === 0) {
        alert("No schedule events found on this page.");
        return;
    }
    const quarterInfo = await getQuarterInfo();
    createPreviewModal(events, quarterInfo);
    });

    const buttonWrapper = document.createElement("div");
    buttonWrapper.classList.add("fr", "fullwidthmobile");
    buttonWrapper.appendChild(bigRedButton);

    const buttonContainer = document.querySelector(".col-lg-10.col-sm-9");
    if (buttonContainer) {
    buttonContainer.appendChild(buttonWrapper);
    } else {
    console.error("Button container not found!");
    }

  }
});
