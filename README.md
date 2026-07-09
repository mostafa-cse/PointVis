# PointVis

A web-based interactive Coordinate Plane visualizer and geometry engine built with HTML5 Canvas, Vanilla JavaScript, and CSS.

## Features
- **Interactive Points**: Click to place mathematical coordinates on a Cartesian plane.
- **Mathematical Lines**: Draw finite line segments, infinite lines, rays, mathematical vectors, and perpendicular bisectors.
- **Polygons & Circles**: Click to draw shaded geometric polygons and perfect circles defined by a center and radius.
- **Real-Time Measurements**: Automatically calculates and visually displays the distance and slope ($m$) of lines, and the exact area of polygons using the Shoelace formula.
- **Transformations**: Reflect points across a "Mirror Center" point, or dilate (scale) them mathematically using a scale factor.
- **Statistical Tools**: Includes a "Best Fit Line" toggle that runs linear regression mathematics on all points on the canvas simultaneously to draw a trendline ($y = mx + b$).
- **Exporting**: One-click download buttons to save the visual canvas as a `.png` image, or export all data coordinates and labels to a `.csv` file.

## Running Locally
This project uses vanilla web technologies. To run it locally, simply serve the directory using any local web server. 

For example, using Python:
```bash
python3 -m http.server 8000
```
Then navigate to `http://localhost:8000` in your web browser.
