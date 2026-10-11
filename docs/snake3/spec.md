# 3D Snake Game

Note: this is a human-authored spec. AI should make no edits here.

## Overview

A 3D snake game built with HTML, CSS, and JavaScript.

This is a classic snake game where the snake moves around a grid and tries to eat food items. Each time the snake eats food, it grows in length and the player's score increases. The game ends if the snake collides with itself or the game boundaries.

## Copy

- Title of the game is "3D Snake"

### Fonts

Use futuristic fonts like "Space Age" or "Space Station" for the title and copy.

## Coordinates

- The world is measured in snake "Units" with each unit being 1 segment of the snake.
- The arena is a volume 30 x 30 x 30 units.
- The arena has a floor and walls.
- The walls are on N, S, E, and W.
- The arena has a ceiling.  The floor is "down" and the ceiling is "up".

## Gameplay

- The game is played in the 3D volume.

### Snake Movement
- The snake is represented by a series of squares that move in a single direction.
- The snake can be controlled using the arrow keys on the keyboard.
- For now, the snake can only move on the floor of the maze.
- The game ends if the snake collides with itself or the game boundaries.
- 

### Food Effects
- Food appears on the floor of the maze at a random location.  There is always one food item on the floor.
- The snake grows in length each time it eats food.

### Scoring
- The game has a high score that is saved in local storage.

### Controls

- The snake can be controlled using the arrow keys on the keyboard.
- The game can be paused using the spacebar.

## Visual Design

### Colors and styles

- Visual style should be similar to the game tron.  Think of the visual styling of the lightcycles.
- Prefer smooth translucent neon colors and a retro pixel art feel.
- The snake should leave a translucent trail behind its main body.
- The floor and walls should have faint gridlines showing the units.
- Color pallette should be limited with only two strong colors and the rest subdued pastels.

### Snake Design

The snake head should have a visible mouth and eyes.

### Maze Design

#### Floors

- The floor of the maze is a faint blue.  There is a slight texture so that motion is visible as the snake moves over the ground.

#### Walls

- The walls of the maze are visible in both viewports.
- Walls should be translucent green.  
- Walls are only two units tall.

#### Ceiling

- The top of the maze is a translucent window with a texture outside the window showing stars.  This skybox should only be visible in the snake perspective view.


## Viewports

The snakes position is represented by four 3D viewports which are stacked on top of each other.

The outlines of the viewports are clear and it is obvious that they are separate viewports.

Each viewport is 400px x 400px.

Each viewport has a small label identifying the view.

The walls of the game play area are visible in all viewports.

### Upper Left Viewport - Top View

The top viewport shows the 3d scene of the snake from the top.

In this view we are looking down on the floor.  The north wall is on the top
of the viewport and the east wall is on the right of the viewport.

Make sure that the mapping of the controls matches the orientation of the top viewport.  Moving the up arrow should steer the snake to the top of the webpage.  The left arrow should steer the snake to the left of the page.

### Upper Right Viewport - West View

This viewport shows the maze from an orthographic perspective from the side, looking west.

The floor of the volume should be aligned to the right edge of the viewport and the ceiling is on the left edge of the viewport.

The north side of the arena is on the top of the viewport and the south side is on the bottom of the viewport.

The north-south orientation of this viewport should match the Top View viewport.  The y position in the screen coordinates should be the same in both upper viewports.

### Lower Left Viewport - North View

This viewport shows the maze from an orthographic perspective from the side, looking north.

The bottom of the viewport maps to the floor of the arena and the top of the viewport maps to the ceiling of the arena.

The left side of the viewport maps to the west wall and the right side of the viewport maps to the east wall.

The x coordinate in the screen should be the same in both upper left and lower left viewports.

The floor of the volume should be aligned to the bottom edge of the viewport.

### Lower Right Viewport - Snake View

This viewport shows the maze from an orthographic perspective that is about two segments behind the head of the snake.

The top of the viewport maps to "up".

The walls of the game play area are visible in both viewports.



## Audio

- The game has a background track that plays when the game is active similar to a movie sound track.
- The background track should be a smooth, electronic, and futuristic music.
- Avoid backing track which is just a low hum.
- When the game is not active, the background track should be muted.
- The game has a sfx that plays when the snake eats food.

## Implementation details

The game is implemented using HTML, CSS, and JavaScript. The game canvas is created using the HTML5 canvas element, and the game logic is implemented using JavaScript. The game is styled using CSS to create a modern and engaging user interface.

- The game is served from a single index.html file with CSS in style.css.
- Use three.js for the 3D rendering.
- Use web audio for the audio.


## Discovery

The Snake game is listed in the treehousecapital vibe demos catalog.