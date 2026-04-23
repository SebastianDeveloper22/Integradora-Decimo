// Shared SLP dataset used by activity and plant layout views.
(function () {
  "use strict";

  window.SLP_DATA = {
    AREAS: [
      { id: 1, name: "Maintenance", slp: 22, zone: "PROD" },
      { id: 2, name: "Conv. Mach./Welding", slp: 25, zone: "PROD" },
      { id: 3, name: "CNC Machining", slp: 26, zone: "PROD" },
      { id: 4, name: "Assembly", slp: 28, zone: "PROD" },
      { id: 5, name: "Quality", slp: 21, zone: "PROD" },
      { id: 6, name: "Warehouse", slp: 26, zone: "LOG" },
      { id: 7, name: "Cutting", slp: 22, zone: "PROD" },
      { id: 8, name: "Free Zone", slp: 4, zone: "SEG" },
      { id: 9, name: "Offices", slp: 23, zone: "ADMIN" },
      { id: 10, name: "Automation", slp: 22, zone: "PROD" },
      { id: 11, name: "Sales", slp: 16, zone: "ADMIN" },
      { id: 12, name: "Boardroom", slp: 14, zone: "ADMIN" },
      { id: 13, name: "Meeting Point", slp: 17, zone: "SEG" },
      { id: 14, name: "Reception", slp: 13, zone: "ADMIN" },
      { id: 15, name: "Human Resources", slp: 13, zone: "ADMIN" },
      { id: 16, name: "Restrooms", slp: 19, zone: "SERV" },
      { id: 17, name: "Loading & Unloading", slp: 21, zone: "LOG" }
    ],
    ZONES: {
      PROD: { fill: "#1e4d8c", stroke: "#2d6ab8", text: "#9dccf0", label: "Production" },
      LOG: { fill: "#7a3f00", stroke: "#b86010", text: "#f0c070", label: "Logistics" },
      ADMIN: { fill: "#0e4a22", stroke: "#1a7838", text: "#7ae8a0", label: "Administrative" },
      SERV: { fill: "#5a1280", stroke: "#8a28c0", text: "#d0a0f0", label: "Services" },
      SEG: { fill: "#3a3a18", stroke: "#6a6a30", text: "#d4d470", label: "Sec./Free" }
    },
    TRIANGLE: [
      "I","I","I","O","E","I","U","O","A","U","U","O","U","U","O","E",
      "E","A","I","E","A","U","X","I","X","X","O","X","X","O","E",
      "A","I","E","A","U","U","E","U","U","O","U","U","O","E",
      "A","A","I","U","O","E","U","U","O","U","U","O","I",
      "E","I","U","I","I","U","U","O","U","U","O","O",
      "E","U","O","I","U","U","O","U","U","O","A",
      "U","U","O","U","U","O","U","U","O","I",
      "U","U","U","U","E","U","U","O","U",
      "I","A","E","O","I","E","I","O",
      "U","U","O","U","U","O","O",
      "A","O","E","I","I","X",
      "O","I","I","I","X",
      "O","O","O","O",
      "E","I","X",
      "I","X",
      "O"
    ]
  };
})();
