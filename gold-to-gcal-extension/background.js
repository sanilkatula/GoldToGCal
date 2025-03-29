// ////////////////////////////////////////
// // BACKGROUND SCRIPT
// ////////////////////////////////////////

// Helper: Pad a number with a leading zero if needed.
function pad(num) {
    return num < 10 ? "0" + num : "" + num;
  }
  
  // Helper: Convert a time string (e.g., "02:00 PM") to a 24-hour format string (e.g., "14:00:00").
  function convertTo24Hour(timeStr) {
    const [time, modifier] = timeStr.split(" ");
    let [hours, minutes] = time.split(":");
    if (hours === "12") {
      hours = modifier === "AM" ? "00" : "12";
    } else {
      hours = modifier === "PM" ? String(+hours + 12) : hours;
    }
    return `${hours}:${minutes}:00`;
  }
  
  // Helper: Given a day letter ("M", "T", etc.) and a quarter start date, find the first date that matches.
  function getFirstOccurrenceDate(dayLetter, quarterStartDate) {
    const dayMap = { "M": 1, "T": 2, "W": 3, "R": 4, "F": 5, "S": 6, "U": 0 };
    const targetDay = dayMap[dayLetter];
    let date = new Date(quarterStartDate);
    let safety = 0;
    while (date.getDay() !== targetDay && safety < 7) {
      date.setDate(date.getDate() + 1);
      safety++;
    }
    return date;
  }
  
  // --- Google Calendar API Functions ---
  
  // Create a new calendar with the given summary.
  async function createCalendar(calendarSummary, token) {
    const response = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: calendarSummary,
        timeZone: "America/Los_Angeles",
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error("Failed to create calendar: " + errText);
    }
    const data = await response.json();
    console.log("Created calendar:", data);
    return data.id; // new calendar ID
  }
  
  // Insert an event into the given calendar.
  async function insertEvent(calendarId, eventData, token) {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventData),
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error("Failed to insert event: " + errText);
    }
    const data = await response.json();
    console.log("Inserted event:", data);
    return data;
  }
  
  // Main function: transform raw events, create a calendar, and insert events.
  async function addEventsToGoogleCalendar(events, quarterStart, quarterEnd, token, calendarSummary) {
    const quarterStartDate = new Date(quarterStart);
    const quarterEndDate = new Date(quarterEnd);
  
    // Create a new calendar.
    const calendarId = await createCalendar(calendarSummary, token);
    console.log("Calendar created with ID:", calendarId);
  
    // Loop over each raw event and transform it.
    for (const ev of events) {
      try {
        // 1. Get the first occurrence date for this event.
        const firstDate = getFirstOccurrenceDate(ev.day, quarterStartDate);
  
        // 2. Convert start/end times.
        const startTime = convertTo24Hour(ev.start);
        const endTime = convertTo24Hour(ev.end);
  
        // 3. Build Date objects from the first date.
        const [startHour, startMin, startSec] = startTime.split(":").map(Number);
        const startDateTime = new Date(firstDate);
        startDateTime.setHours(startHour, startMin, startSec);
  
        const [endHour, endMin, endSec] = endTime.split(":").map(Number);
        const endDateTime = new Date(firstDate);
        endDateTime.setHours(endHour, endMin, endSec);
  
        // 4. Build the final event object in the format expected by Google Calendar.
        const eventData = {
          summary: ev.course,
          location: ev.location,
          start: {
            dateTime: startDateTime.toISOString(),
            timeZone: "America/Los_Angeles",
          },
          end: {
            dateTime: endDateTime.toISOString(),
            timeZone: "America/Los_Angeles",
          },
          recurrence: [
            `RRULE:FREQ=WEEKLY;UNTIL=${quarterEndDate.getFullYear()}${pad(quarterEndDate.getMonth() + 1)}${pad(quarterEndDate.getDate())}T000000Z`
          ],
        };
  
        console.log("Inserting event data:", eventData);
        await insertEvent(calendarId, eventData, token);
      } catch (err) {
        console.error("Error inserting event:", err);
      }
    }
    return calendarId;
  }
  
  // Listen for messages from the content script.
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ADD_TO_GCAL") {
      const { events, quarterStart, quarterEnd, calendarSummary } = request.payload;
  
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }
        console.log("OAuth token obtained in background:", token);
        try {
          const calendarId = await addEventsToGoogleCalendar(
            events,
            quarterStart,
            quarterEnd,
            token,
            calendarSummary
          );
          sendResponse({ success: true, calendarId });
        } catch (err) {
          sendResponse({ error: err.message });
        }
      });
      return true;
    }
  });
  