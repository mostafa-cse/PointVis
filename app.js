const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');
const pointsList = document.getElementById('points-list');
const clearBtn = document.getElementById('clearBtn');
const tooltip = document.getElementById('tooltip');
const modePointBtn = document.getElementById('mode-point');
const modeLineBtn = document.getElementById('mode-line');
const modePolygonBtn = document.getElementById('mode-polygon');
const modeCircleBtn = document.getElementById('mode-circle');
const modeReflectBtn = document.getElementById('mode-reflect');
const modeDilateBtn = document.getElementById('mode-dilate');
const modeMoveBtn = document.getElementById('mode-move');
const lineTypeContainer = document.getElementById('line-type-container');
const lineTypeSelect = document.getElementById('line-type');
const bestFitToggle = document.getElementById('best-fit-toggle');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const sidebar = document.getElementById('sidebar');
const statusHint = document.getElementById('status-hint');

// Configuration
const config = {
    gridSize: 50, // Pixels per unit
    pointRadius: 6,
    snapDistance: 0.3, // Snap to integer if within 0.3 units
    colors: {
        bg: 'transparent',
        grid: 'rgba(148, 163, 184, 0.1)',
        axis: 'rgba(148, 163, 184, 0.5)',
        text: '#94a3b8',
        point: '#0ea5e9',
        pointGlow: 'rgba(14, 165, 233, 0.4)',
        pointText: '#f8fafc'
    },
    fonts: {
        ui: '12px Inter, sans-serif',
        math: 'italic 16px "Libre Baskerville", serif'
    }
};

let points = []; // Array of {x, y, id, color}
let lines = [];  // Array of {p1, p2, type}
let circles = []; // Array of {id, cx, cy, r, color}
let polygons = []; // Array of {id, points: [id1, id2...], color}
let pendingPolygonPoints = []; // Array of point IDs

let nextPointId = 1;
let currentMode = 'add'; // 'add', 'line', 'polygon', 'circle', 'reflect', 'dilate', 'move'
let connectingPointId = null; // ID of the first point selected for a line
let transformSourcePointId = null; // ID of the first point selected for transformations
let hoverScreenCoords = null; // {x, y} for drawing temporary line
let draggingPointId = null; // ID of the point being dragged

let isPanning = false;
let panStartX = null;
let panStartY = null;
let offsetX = 0;
let offsetY = 0;

let hoveredPointId = null; // ID of the point currently being hovered

let width, height, originX, originY;

// Initialize
function init() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
        tooltip.classList.add('hidden');
        hoverScreenCoords = null;
    });
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    clearBtn.addEventListener('click', clearPoints);
    
    modePointBtn.addEventListener('click', () => setMode('add'));
    modeLineBtn.addEventListener('click', () => setMode('line'));
    modePolygonBtn.addEventListener('click', () => setMode('polygon'));
    modeCircleBtn.addEventListener('click', () => setMode('circle'));
    modeReflectBtn.addEventListener('click', () => setMode('reflect'));
    modeDilateBtn.addEventListener('click', () => setMode('dilate'));
    modeMoveBtn.addEventListener('click', () => setMode('move'));
    bestFitToggle.addEventListener('change', draw);
    
    toggleSidebarBtn.addEventListener('click', toggleSidebar);
    
    // Automatically redraw when the container resizes (e.g. during sidebar toggle animation)
    const resizeObserver = new ResizeObserver(() => {
        resizeCanvas();
    });
    resizeObserver.observe(canvas.parentElement);
    
    draw();
}

function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    toggleSidebarBtn.classList.toggle('collapsed');
}

function setMode(mode) {
    currentMode = mode;
    modePointBtn.classList.toggle('active', mode === 'add');
    modeLineBtn.classList.toggle('active', mode === 'line');
    modePolygonBtn.classList.toggle('active', mode === 'polygon');
    modeCircleBtn.classList.toggle('active', mode === 'circle');
    modeReflectBtn.classList.toggle('active', mode === 'reflect');
    modeDilateBtn.classList.toggle('active', mode === 'dilate');
    modeMoveBtn.classList.toggle('active', mode === 'move');
    
    lineTypeContainer.classList.toggle('hidden', mode !== 'line');
    
    connectingPointId = null;
    transformSourcePointId = null;
    pendingPolygonPoints = [];
    updateStatusHint();
    draw();
}

function updateStatusHint() {
    const hints = {
        add: 'Click on the grid to place a point.',
        line: connectingPointId ? 'Click a second point to complete the line.' : 'Click on a point to start a line.',
        polygon: pendingPolygonPoints.length === 0 ? 'Click points to define polygon vertices.' : `${pendingPolygonPoints.length} vertices selected. Click first point to close.`,
        circle: 'Click a point to set the circle center.',
        reflect: transformSourcePointId ? 'Click the mirror center point.' : 'Click the point to reflect.',
        dilate: transformSourcePointId ? 'Click the center of dilation.' : 'Click the point to dilate.',
        move: 'Drag points to reposition. Drag empty space to pan.'
    };
    const text = hints[currentMode] || '';
    if (text) {
        statusHint.textContent = text;
        statusHint.classList.remove('hidden');
    } else {
        statusHint.classList.add('hidden');
    }
}

function resizeCanvas() {
    const parent = canvas.parentElement;
    // Handle high DPI displays for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    width = parent.clientWidth;
    height = parent.clientHeight;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    
    ctx.scale(dpr, dpr);
    
    updateOrigin();
    draw();
}

function updateOrigin() {
    originX = width / 2 + offsetX;
    originY = height / 2 + offsetY;
}

// Coordinate transforms
function screenToMath(sx, sy) {
    const mx = (sx - originX) / config.gridSize;
    const my = -(sy - originY) / config.gridSize; // Y is inverted in screen coords
    return { x: mx, y: my };
}

function mathToScreen(mx, my) {
    const sx = originX + (mx * config.gridSize);
    const sy = originY - (my * config.gridSize);
    return { x: sx, y: sy };
}

function drawGrid() {
    ctx.lineWidth = 1;
    ctx.strokeStyle = config.colors.grid;
    ctx.beginPath();
    
    // Vertical lines
    for (let x = originX % config.gridSize; x < width; x += config.gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    
    // Horizontal lines
    for (let y = originY % config.gridSize; y < height; y += config.gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();
}

function drawAxes() {
    ctx.lineWidth = 2;
    ctx.strokeStyle = config.colors.axis;
    ctx.fillStyle = config.colors.text;
    ctx.font = config.fonts.ui;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // X Axis
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    ctx.stroke();
    
    // Y Axis
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();
    
    // Calculate visible mathematical bounds
    const leftX = screenToMath(0, 0).x;
    const rightX = screenToMath(width, 0).x;
    const topY = screenToMath(0, 0).y;
    const bottomY = screenToMath(0, height).y;
    
    // Clamp the label positions so they are always on-screen
    // For X-axis, the Y-coordinate of labels:
    const labelY = Math.max(20, Math.min(height - 20, originY + 15));
    
    // For Y-axis, the X-coordinate of labels:
    const labelX = Math.max(20, Math.min(width - 20, originX - 15));
    
    // X-axis labels
    const startX = Math.floor(leftX);
    const endX = Math.ceil(rightX);
    for (let i = startX; i <= endX; i++) {
        if (i !== 0) {
            const sx = mathToScreen(i, 0).x;
            ctx.fillText(i, sx, labelY);
            // Tick mark on the actual axis (if visible)
            ctx.beginPath();
            ctx.moveTo(sx, originY - 4);
            ctx.lineTo(sx, originY + 4);
            ctx.stroke();
        }
    }
    
    // Y-axis labels
    const startY = Math.floor(bottomY);
    const endY = Math.ceil(topY);
    for (let i = startY; i <= endY; i++) {
        if (i !== 0) {
            const sy = mathToScreen(0, i).y;
            ctx.fillText(i, labelX, sy);
            // Tick mark on the actual axis (if visible)
            ctx.beginPath();
            ctx.moveTo(originX - 4, sy);
            ctx.lineTo(originX + 4, sy);
            ctx.stroke();
        }
    }
    
    // Origin
    ctx.fillText('0', labelX + 3, labelY);
}

function drawGuides() {
    if (hoveredPointId !== null && currentMode !== 'move') {
        const point = points.find(p => p.id === hoveredPointId);
        if (point) {
            const screenCoords = mathToScreen(point.x, point.y);
            
            // X-axis guide (vertical line)
            const xAxisY = Math.max(0, Math.min(height, originY));
            
            // Y-axis guide (horizontal line)
            const yAxisX = Math.max(0, Math.min(width, originX));
            
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.strokeStyle = config.colors.text; // subtle gray
            
            // Draw to X axis
            ctx.moveTo(screenCoords.x, screenCoords.y);
            ctx.lineTo(screenCoords.x, xAxisY);
            
            // Draw to Y axis
            ctx.moveTo(screenCoords.x, screenCoords.y);
            ctx.lineTo(yAxisX, screenCoords.y);
            
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}

function drawLines() {
    ctx.lineWidth = 2;
    ctx.strokeStyle = config.colors.point;
    
    // Draw confirmed lines
    lines.forEach(line => {
        const p1 = points.find(p => p.id === line.p1);
        const p2 = points.find(p => p.id === line.p2);
        if (p1 && p2) {
            const s1 = mathToScreen(p1.x, p1.y);
            const s2 = mathToScreen(p2.x, p2.y);
            ctx.beginPath();
            
            let drawP1 = { x: s1.x, y: s1.y };
            let drawP2 = { x: s2.x, y: s2.y };
            const type = line.type || 'segment';
            
            const dx = s2.x - s1.x;
            const dy = s2.y - s1.y;
            const angle = Math.atan2(dy, dx);
            
            if (type === 'line' || type === 'ray') {
                const inf = 5000;
                drawP2.x = s2.x + Math.cos(angle) * inf;
                drawP2.y = s2.y + Math.sin(angle) * inf;
                
                if (type === 'line') {
                    drawP1.x = s1.x - Math.cos(angle) * inf;
                    drawP1.y = s1.y - Math.sin(angle) * inf;
                }
            } else if (type === 'perp-bisector') {
                const inf = 5000;
                const midX = (s1.x + s2.x) / 2;
                const midY = (s1.y + s2.y) / 2;
                const perpAngle = angle + Math.PI / 2;
                
                drawP1.x = midX - Math.cos(perpAngle) * inf;
                drawP1.y = midY - Math.sin(perpAngle) * inf;
                drawP2.x = midX + Math.cos(perpAngle) * inf;
                drawP2.y = midY + Math.sin(perpAngle) * inf;
            }
            
            ctx.moveTo(drawP1.x, drawP1.y);
            ctx.lineTo(drawP2.x, drawP2.y);
            ctx.stroke();
            
            if (type === 'vector') {
                const headlen = 12;
                ctx.beginPath();
                ctx.moveTo(s2.x, s2.y);
                ctx.lineTo(s2.x - headlen * Math.cos(angle - Math.PI / 6), s2.y - headlen * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(s2.x, s2.y);
                ctx.lineTo(s2.x - headlen * Math.cos(angle + Math.PI / 6), s2.y - headlen * Math.sin(angle + Math.PI / 6));
                ctx.stroke();
            }
            
            // Calculate and draw distance
            const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(2);
            
            // Calculate slope
            let mText = '∞';
            if (Math.abs(p2.x - p1.x) > 0.0001) {
                const m = (p2.y - p1.y) / (p2.x - p1.x);
                mText = m.toFixed(2);
            }
            
            const midX = (s1.x + s2.x) / 2;
            const midY = (s1.y + s2.y) / 2;
            
            ctx.font = '12px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const text = `d: ${distance} | m: ${mText}`;
            
            // Draw background pill for text readability
            const textWidth = ctx.measureText(text).width;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
            ctx.beginPath();
            ctx.roundRect(midX - textWidth/2 - 4, midY - 10, textWidth + 8, 20, 4);
            ctx.fill();
            
            ctx.fillStyle = config.colors.text;
            ctx.fillText(text, midX, midY);
        }
    });
    
    // Draw temporary line
    if (currentMode === 'line' && connectingPointId !== null && hoverScreenCoords) {
        const p1 = points.find(p => p.id === connectingPointId);
        if (p1) {
            const s1 = mathToScreen(p1.x, p1.y);
            const type = lineTypeSelect.value;
            
            ctx.beginPath();
            ctx.setLineDash([5, 5]);
            
            let drawP1 = { x: s1.x, y: s1.y };
            let drawP2 = { x: hoverScreenCoords.x, y: hoverScreenCoords.y };
            
            const dx = drawP2.x - s1.x;
            const dy = drawP2.y - s1.y;
            const angle = Math.atan2(dy, dx);
            
            if (type === 'line' || type === 'ray') {
                const inf = 5000;
                drawP2.x = s1.x + Math.cos(angle) * inf;
                drawP2.y = s1.y + Math.sin(angle) * inf;
                
                if (type === 'line') {
                    drawP1.x = s1.x - Math.cos(angle) * inf;
                    drawP1.y = s1.y - Math.sin(angle) * inf;
                }
            } else if (type === 'perp-bisector') {
                const inf = 5000;
                const midX = (s1.x + hoverScreenCoords.x) / 2;
                const midY = (s1.y + hoverScreenCoords.y) / 2;
                const perpAngle = angle + Math.PI / 2;
                
                drawP1.x = midX - Math.cos(perpAngle) * inf;
                drawP1.y = midY - Math.sin(perpAngle) * inf;
                const oldP2x = drawP2.x;
                const oldP2y = drawP2.y;
                drawP2.x = midX + Math.cos(perpAngle) * inf;
                drawP2.y = midY + Math.sin(perpAngle) * inf;
                
                // Draw a faint guide for the segment being bisected
                ctx.beginPath();
                ctx.setLineDash([2, 4]);
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(oldP2x, oldP2y);
                ctx.stroke();
                
                ctx.setLineDash([5, 5]); // restore for the main line
                ctx.beginPath();
            }
            
            ctx.moveTo(drawP1.x, drawP1.y);
            ctx.lineTo(drawP2.x, drawP2.y);
            ctx.stroke();
            
            if (type === 'vector') {
                const headlen = 12;
                ctx.beginPath();
                ctx.moveTo(hoverScreenCoords.x, hoverScreenCoords.y);
                ctx.lineTo(hoverScreenCoords.x - headlen * Math.cos(angle - Math.PI / 6), hoverScreenCoords.y - headlen * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(hoverScreenCoords.x, hoverScreenCoords.y);
                ctx.lineTo(hoverScreenCoords.x - headlen * Math.cos(angle + Math.PI / 6), hoverScreenCoords.y - headlen * Math.sin(angle + Math.PI / 6));
                ctx.stroke();
            }
            
            ctx.setLineDash([]); // reset dash
        }
    }
}

function drawBestFitLine() {
    if (points.length < 2) return;
    
    // Calculate means
    let sumX = 0, sumY = 0;
    points.forEach(p => {
        sumX += p.x;
        sumY += p.y;
    });
    const meanX = sumX / points.length;
    const meanY = sumY / points.length;
    
    // Calculate slope (m) and y-intercept (b)
    let numerator = 0;
    let denominator = 0;
    points.forEach(p => {
        numerator += (p.x - meanX) * (p.y - meanY);
        denominator += (p.x - meanX) ** 2;
    });
    
    // If all points are perfectly vertical, handle gracefully (avoid NaN)
    if (denominator === 0) return; 
    
    const m = numerator / denominator;
    const b = meanY - m * meanX;
    
    // Two points far apart in math space
    const mathX1 = -10000;
    const mathY1 = m * mathX1 + b;
    const mathX2 = 10000;
    const mathY2 = m * mathX2 + b;
    
    const s1 = mathToScreen(mathX1, mathY1);
    const s2 = mathToScreen(mathX2, mathY2);
    
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.strokeStyle = '#ef4444'; // Red color for best fit line
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();
    
    // Draw equation label
    const sMid = mathToScreen(meanX, meanY);
    
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    
    // Draw background pill for text readability
    const bSign = b >= 0 ? '+' : '−';
    const bAbs = Math.abs(b).toFixed(2);
    const eqText = `y = ${m.toFixed(2)}x ${bSign} ${bAbs}`;
    const textWidth = ctx.measureText(eqText).width;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.beginPath();
    ctx.roundRect(sMid.x + 16, sMid.y - 32, textWidth + 8, 20, 4);
    ctx.fill();
    
    ctx.fillStyle = '#ef4444';
    ctx.fillText(eqText, sMid.x + 20, sMid.y - 18);
}

function drawCircles() {
    circles.forEach(c => {
        // Look up the center point by ID so circles follow point moves
        const centerPt = points.find(p => p.id === c.pointId);
        if (!centerPt) return;
        
        const s = mathToScreen(centerPt.x, centerPt.y);
        const screenRadius = c.r * config.gridSize;
        
        ctx.beginPath();
        ctx.arc(s.x, s.y, screenRadius, 0, Math.PI * 2);
        
        let fillStyle = 'rgba(14, 165, 233, 0.2)';
        if (c.color.startsWith('#') && c.color.length === 7) {
            const r = parseInt(c.color.slice(1,3), 16);
            const g = parseInt(c.color.slice(3,5), 16);
            const b = parseInt(c.color.slice(5,7), 16);
            fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
        }
        
        ctx.fillStyle = fillStyle;
        ctx.fill();
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

function drawPolygons() {
    polygons.forEach(poly => {
        if (poly.points.length < 3) return;
        
        ctx.beginPath();
        poly.points.forEach((pid, index) => {
            const p = points.find(point => point.id === pid);
            if (!p) return;
            const s = mathToScreen(p.x, p.y);
            if (index === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
        
        let fillStyle = 'rgba(14, 165, 233, 0.2)';
        if (poly.color.startsWith('#') && poly.color.length === 7) {
            const r = parseInt(poly.color.slice(1,3), 16);
            const g = parseInt(poly.color.slice(3,5), 16);
            const b = parseInt(poly.color.slice(5,7), 16);
            fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
        }
        
        ctx.fillStyle = fillStyle;
        ctx.fill();
        ctx.strokeStyle = poly.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Calculate Area and Centroid
        let area = 0;
        const pts = poly.points.map(pid => points.find(point => point.id === pid)).filter(Boolean);
        
        if (pts.length >= 3) {
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                area += (pts[i].x * pts[j].y - pts[j].x * pts[i].y);
            }
            area = Math.abs(area / 2);
            
            const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
            const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
            
            const sCenter = mathToScreen(cx, cy);
            
            ctx.fillStyle = config.colors.text;
            ctx.font = '13px ' + config.fonts.ui;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const areaText = `Area: ${area.toFixed(2)}`;
            const textWidth = ctx.measureText(areaText).width;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
            ctx.beginPath();
            ctx.roundRect(sCenter.x - textWidth/2 - 6, sCenter.y - 12, textWidth + 12, 24, 12);
            ctx.fill();
            
            ctx.fillStyle = config.colors.text;
            ctx.fillText(areaText, sCenter.x, sCenter.y);
        }
    });
    
    if (pendingPolygonPoints.length > 0) {
        ctx.beginPath();
        pendingPolygonPoints.forEach((pid, index) => {
            const p = points.find(point => point.id === pid);
            if (!p) return;
            const s = mathToScreen(p.x, p.y);
            if (index === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
        });
        
        if (hoverScreenCoords) {
            ctx.lineTo(hoverScreenCoords.x, hoverScreenCoords.y);
        }
        
        ctx.strokeStyle = config.colors.point;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function drawPoints() {
    points.forEach(point => {
        const screenCoords = mathToScreen(point.x, point.y);
        const pColor = point.color || config.colors.point;
        
        const isSelected = (point.id === draggingPointId || point.id === transformSourcePointId || point.id === connectingPointId);
        
        // Glow effect
        ctx.beginPath();
        const glowRadius = isSelected ? config.pointRadius * 3.5 : config.pointRadius * 2.5;
        ctx.arc(screenCoords.x, screenCoords.y, glowRadius, 0, Math.PI * 2);
        
        // Extract RGB and apply alpha for glow
        const isHex = pColor.startsWith('#');
        let r, g, b;
        if (isHex && pColor.length === 7) {
            r = parseInt(pColor.slice(1, 3), 16);
            g = parseInt(pColor.slice(3, 5), 16);
            b = parseInt(pColor.slice(5, 7), 16);
        } else {
            // Default blue fallback
            r = 14; g = 165; b = 233;
        }
        
        const glowAlpha = isSelected ? 0.8 : 0.4;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${glowAlpha})`;
        ctx.fill();
        
        if (isSelected) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = pColor;
        } else {
            ctx.shadowBlur = 0;
        }
        
        // Point
        ctx.beginPath();
        ctx.arc(screenCoords.x, screenCoords.y, config.pointRadius, 0, Math.PI * 2);
        ctx.fillStyle = pColor;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Reset shadow for text
        ctx.shadowBlur = 0;
        
        // Label
        ctx.font = config.fonts.math;
        ctx.fillStyle = config.colors.pointText;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        // Draw P_n
        ctx.fillText(`P${point.id}`, screenCoords.x + 10, screenCoords.y - 10);
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawAxes();
    drawPolygons();
    drawCircles();
    drawGuides();
    drawLines();
    
    if (bestFitToggle && bestFitToggle.checked) {
        drawBestFitLine();
    }
    
    drawPoints();
}

function handleCanvasClick(e) {
    if (currentMode === 'move' || hasMovedDuringMouseDown) {
        hasMovedDuringMouseDown = false; // Reset it
        return; 
    }

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Find if we clicked on an existing point
    const clickedPoint = points.find(p => {
        const ps = mathToScreen(p.x, p.y);
        const dist = Math.hypot(ps.x - clickX, ps.y - clickY);
        return dist < config.pointRadius * 3;
    });

    if (currentMode === 'add') {
        let { x, y } = screenToMath(clickX, clickY);
        const roundedX = Math.round(x);
        const roundedY = Math.round(y);
        if (Math.abs(x - roundedX) < config.snapDistance && Math.abs(y - roundedY) < config.snapDistance) {
            x = roundedX;
            y = roundedY;
        } else {
            x = Number(x.toFixed(1));
            y = Number(y.toFixed(1));
        }
        const p = {
            id: nextPointId++,
            x: x,
            y: y,
            color: config.colors.point
        };
        points.push(p);
        draw();
        updateSidebar();
    } else if (currentMode === 'line') {
        if (lineTypeSelect.value === 'length') {
            if (clickedPoint) {
                const lenStr = prompt("Enter segment length:");
                if (lenStr !== null && !isNaN(lenStr) && lenStr.trim() !== '') {
                    const len = parseFloat(lenStr);
                    const newId = nextPointId++;
                    const p = {
                        id: newId,
                        x: Number((clickedPoint.x + len).toFixed(2)),
                        y: clickedPoint.y,
                        color: config.colors.point
                    };
                    points.push(p);
                    lines.push({ p1: clickedPoint.id, p2: newId, type: 'segment' });
                    updateSidebar();
                    draw();
                }
            }
            return;
        }
        
        if (clickedPoint) {
            if (connectingPointId === null) {
                connectingPointId = clickedPoint.id;
            } else if (connectingPointId !== clickedPoint.id) {
                const exists = lines.some(l => 
                    (l.p1 === connectingPointId && l.p2 === clickedPoint.id) ||
                    (l.p1 === clickedPoint.id && l.p2 === connectingPointId)
                );
                if (!exists) {
                    lines.push({ p1: connectingPointId, p2: clickedPoint.id, type: lineTypeSelect.value });
                }
                connectingPointId = null;
            } else {
                connectingPointId = null; // clicked same point, cancel
            }
            draw();
            updateStatusHint();
        }
    } else if (currentMode === 'circle') {
        if (clickedPoint) {
            const rStr = prompt("Enter circle radius:");
            if (rStr !== null && !isNaN(rStr) && rStr.trim() !== '') {
                const r = parseFloat(rStr);
                circles.push({
                    id: Math.random(),
                    pointId: clickedPoint.id,
                    r: r,
                    color: clickedPoint.color || config.colors.point
                });
                draw();
            }
        }
    } else if (currentMode === 'polygon') {
        if (clickedPoint) {
            // Check if clicking the FIRST point of the pending polygon to close it
            if (pendingPolygonPoints.length >= 3 && clickedPoint.id === pendingPolygonPoints[0]) {
                polygons.push({
                    id: Math.random(),
                    points: [...pendingPolygonPoints],
                    color: clickedPoint.color || config.colors.point
                });
                pendingPolygonPoints = [];
            } else if (!pendingPolygonPoints.includes(clickedPoint.id)) {
                pendingPolygonPoints.push(clickedPoint.id);
            }
            draw();
            updateStatusHint();
        }
    } else if (currentMode === 'reflect') {
        if (clickedPoint) {
            if (!transformSourcePointId) {
                transformSourcePointId = clickedPoint.id;
            } else {
                if (transformSourcePointId !== clickedPoint.id) {
                    const sourcePoint = points.find(p => p.id === transformSourcePointId);
                    const centerPoint = clickedPoint;
                    
                    // A' = 2B - A
                    const newX = 2 * centerPoint.x - sourcePoint.x;
                    const newY = 2 * centerPoint.y - sourcePoint.y;
                    
                    const newPt = {
                        x: newX,
                        y: newY,
                        id: nextPointId++,
                        color: sourcePoint.color
                    };
                    points.push(newPt);
                    updateSidebar();
                }
                transformSourcePointId = null;
            }
            draw();
            updateStatusHint();
        }
    } else if (currentMode === 'dilate') {
        if (clickedPoint) {
            if (!transformSourcePointId) {
                transformSourcePointId = clickedPoint.id;
            } else {
                if (transformSourcePointId !== clickedPoint.id) {
                    const scaleStr = prompt("Enter scale factor (e.g., 2 or 0.5):");
                    if (scaleStr !== null && !isNaN(scaleStr) && scaleStr.trim() !== '') {
                        const k = parseFloat(scaleStr);
                        const sourcePoint = points.find(p => p.id === transformSourcePointId);
                        const centerPoint = clickedPoint;
                        
                        // A' = B + k(A - B)
                        const newX = centerPoint.x + k * (sourcePoint.x - centerPoint.x);
                        const newY = centerPoint.y + k * (sourcePoint.y - centerPoint.y);
                        
                        const newPt = {
                            x: newX,
                            y: newY,
                            id: nextPointId++,
                            color: sourcePoint.color
                        };
                        points.push(newPt);
                        updateSidebar();
                    }
                }
                transformSourcePointId = null;
            }
            draw();
            updateStatusHint();
        }
    } else if (currentMode === 'move') {
    }
}

function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    hoverScreenCoords = { x: clickX, y: clickY };
    
    // Check if we should start panning
    if (panStartX !== null && !isPanning) {
        if (Math.abs(e.clientX - panStartX) > 3 || Math.abs(e.clientY - panStartY) > 3) {
            isPanning = true;
            canvas.style.cursor = 'grabbing';
        }
    }
    
    if (isPanning) {
        const dx = e.clientX - panStartX;
        const dy = e.clientY - panStartY;
        offsetX += dx;
        offsetY += dy;
        panStartX = e.clientX;
        panStartY = e.clientY;
        updateOrigin();
        draw();
        tooltip.classList.add('hidden');
        return;
    }
    
    if (draggingPointId !== null && currentMode === 'move') {
        const point = points.find(p => p.id === draggingPointId);
        if (point) {
            let { x, y } = screenToMath(clickX, clickY);
            
            // Snap to grid
            const roundedX = Math.round(x);
            const roundedY = Math.round(y);
            if (Math.abs(x - roundedX) < config.snapDistance && Math.abs(y - roundedY) < config.snapDistance) {
                x = roundedX;
                y = roundedY;
            } else {
                x = Number(x.toFixed(1));
                y = Number(y.toFixed(1));
            }
            
            point.x = x;
            point.y = y;
            draw();
        }
        return;
    }
    
    // Check if hovering over an existing point
    const hoveredPoint = points.find(p => {
        const ps = mathToScreen(p.x, p.y);
        const dist = Math.hypot(ps.x - clickX, ps.y - clickY);
        return dist < config.pointRadius * 3;
    });
    
    let needsRedraw = false;
    
    if (hoveredPoint) {
        if (hoveredPointId !== hoveredPoint.id) {
            hoveredPointId = hoveredPoint.id;
            needsRedraw = true;
            
            // Highlight in sidebar
            const items = pointsList.querySelectorAll('li');
            items.forEach(item => {
                if (item.dataset.id == hoveredPoint.id) item.classList.add('hover-highlight');
                else item.classList.remove('hover-highlight');
            });
        }
        
        if (currentMode === 'move') {
            canvas.style.cursor = draggingPointId ? 'grabbing' : 'grab';
        } else if (currentMode === 'line') {
            canvas.style.cursor = 'crosshair';
        } else {
            canvas.style.cursor = 'pointer';
        }
        
        tooltip.textContent = `P${hoveredPoint.id}(${hoveredPoint.x}, ${hoveredPoint.y})`;
        tooltip.style.left = `${e.clientX}px`;
        tooltip.style.top = `${e.clientY}px`;
        tooltip.classList.remove('hidden');
    } else {
        if (hoveredPointId !== null) {
            hoveredPointId = null;
            needsRedraw = true;
            
            // Remove highlight in sidebar
            const items = pointsList.querySelectorAll('li');
            items.forEach(item => item.classList.remove('hover-highlight'));
        }
        
        if (currentMode === 'add' || currentMode === 'polygon' || currentMode === 'circle') {
            canvas.style.cursor = 'crosshair';
        } else if (['line', 'reflect', 'dilate'].includes(currentMode)) {
            canvas.style.cursor = 'default';
        } else if (currentMode === 'move') {
            canvas.style.cursor = isPanning ? 'grabbing' : 'grab';
        }
        
        // Show math coordinates of cursor position
        const mathPos = screenToMath(clickX, clickY);
        const dispX = Math.abs(mathPos.x - Math.round(mathPos.x)) < config.snapDistance
            ? Math.round(mathPos.x) : Number(mathPos.x.toFixed(1));
        const dispY = Math.abs(mathPos.y - Math.round(mathPos.y)) < config.snapDistance
            ? Math.round(mathPos.y) : Number(mathPos.y.toFixed(1));
        tooltip.textContent = `(${dispX}, ${dispY})`;
        tooltip.style.left = `${e.clientX}px`;
        tooltip.style.top = `${e.clientY}px`;
        tooltip.classList.remove('hidden');
    }
    
    // Redraw to update temporary line or polygon preview
    if ((currentMode === 'line' && connectingPointId !== null) ||
        (currentMode === 'polygon' && pendingPolygonPoints.length > 0)) {
        needsRedraw = true;
    }
    
    if (needsRedraw) {
        draw();
    }
}

function handleWheel(e) {
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomIntensity = 0.1;
    const wheel = e.deltaY < 0 ? 1 : -1;
    const zoomFactor = Math.exp(wheel * zoomIntensity);
    
    const mathCoords = screenToMath(mouseX, mouseY);
    
    config.gridSize = Math.max(10, Math.min(200, config.gridSize * zoomFactor));
    
    originX = mouseX - (mathCoords.x * config.gridSize);
    originY = mouseY + (mathCoords.y * config.gridSize);
    
    offsetX = originX - width / 2;
    offsetY = originY - height / 2;
    
    draw();
}

function handleTouchStart(e) {
    if (e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY, button: 0 });
    }
}

function handleTouchMove(e) {
    if (e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
}

function handleTouchEnd(e) {
    e.preventDefault();
    if (e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        handleMouseUp({ clientX: touch.clientX, clientY: touch.clientY });
    }
}

let hasMovedDuringMouseDown = false;

function handleMouseDown(e) {
    hasMovedDuringMouseDown = false;
    
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const clickedPoint = points.find(p => {
        const ps = mathToScreen(p.x, p.y);
        const dist = Math.hypot(ps.x - clickX, ps.y - clickY);
        return dist < config.pointRadius * 3;
    });
    
    if (clickedPoint && currentMode === 'move') {
        draggingPointId = clickedPoint.id;
        canvas.style.cursor = 'grabbing';
    } else if (!clickedPoint) {
        // Start potential pan
        panStartX = e.clientX;
        panStartY = e.clientY;
    }
}

function handleMouseUp(e) {
    if (isPanning) {
        isPanning = false;
        canvas.style.cursor = 'default';
        // We set hasMovedDuringMouseDown if we panned so the click event doesn't fire and add a point
        hasMovedDuringMouseDown = true;
    }
    
    panStartX = null;
    panStartY = null;

    if (draggingPointId !== null) {
        draggingPointId = null;
        updateSidebar();
        draw();
    }
}

function updateSidebar() {
    if (points.length === 0) {
        pointsList.innerHTML = '<li class="empty-state">No points added yet.</li>';
        return;
    }
    
    pointsList.innerHTML = '';
    points.forEach(point => {
        const li = document.createElement('li');
        li.dataset.id = point.id;
        
        // LaTeX style text container
        const labelDiv = document.createElement('div');
        labelDiv.className = 'point-label';
        katex.render(`P_{${point.id}}`, labelDiv, { throwOnError: false });
        
        // Color Picker
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.className = 'point-color-picker';
        colorPicker.value = point.color || config.colors.point;
        colorPicker.title = 'Change color';
        colorPicker.addEventListener('input', (e) => {
            point.color = e.target.value;
            draw();
        });
        
        const coordsDiv = document.createElement('div');
        coordsDiv.className = 'point-coords';
        coordsDiv.textContent = `(${point.x}, ${point.y})`;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        deleteBtn.title = "Remove point";
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removePoint(point.id);
        });
        
        li.appendChild(labelDiv);
        li.appendChild(colorPicker);
        li.appendChild(coordsDiv);
        li.appendChild(deleteBtn);
        
        // Highlight on canvas on hover
        li.addEventListener('mouseenter', () => highlightPoint(point.id, true));
        li.addEventListener('mouseleave', () => highlightPoint(point.id, false));
        
        pointsList.appendChild(li);
    });
}

function highlightPoint(id, isHighlight) {
    if (isHighlight) {
        hoveredPointId = id;
    } else if (hoveredPointId === id) {
        hoveredPointId = null;
    }
    draw();
}

function removePoint(id) {
    points = points.filter(p => p.id !== id);
    lines = lines.filter(l => l.p1 !== id && l.p2 !== id);
    circles = circles.filter(c => c.pointId !== id);
    polygons = polygons.filter(poly => !poly.points.includes(id));
    pendingPolygonPoints = pendingPolygonPoints.filter(pid => pid !== id);
    
    if (hoveredPointId === id) hoveredPointId = null;
    if (draggingPointId === id) draggingPointId = null;
    if (connectingPointId === id) connectingPointId = null;
    if (transformSourcePointId === id) transformSourcePointId = null;
    
    draw();
    updateSidebar();
}

function clearPoints() {
    points = [];
    lines = [];
    circles = [];
    polygons = [];
    pendingPolygonPoints = [];
    nextPointId = 1;
    hoveredPointId = null;
    draggingPointId = null;
    connectingPointId = null;
    transformSourcePointId = null;
    draw();
    updateSidebar();
}

// Exports
document.getElementById('exportImageBtn').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'pointvis-export.png';
    // Draw background before exporting
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.fillStyle = '#0f172a'; // match sidebar/bg approx
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tCtx.drawImage(canvas, 0, 0);
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
    let csv = "ID,X,Y\n";
    points.forEach(p => {
        csv += `P${p.id},${p.x},${p.y}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'points.csv';
    link.click();
});

// Duplicate clearBtn listener removed (already attached in init())

// Start
init();
