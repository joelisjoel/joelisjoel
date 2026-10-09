# 2D Snake Game

Note: this is a human-authored spec. AI should make no edits here.

## Overview

A 3D snake game built with HTML, CSS, and JavaScript.

This is a classic 2d snake game where the snake moves around a grid and tries to eat food items. Each time the snake eats food, it grows in length and the player's score increases. The game ends if the snake collides with itself or the game boundaries.

## Copy

- Title of the game is "3D Snake"

### Fonts

Use futuristic fonts like "Space Age" or "Space Station" for the title and copy.

## Coordinates

- The world is measured in snake "Units" with each unit being 1 segment of the snake.
- The arena is a 30 units by 30 Units grid.

## Gameplay

- The game is played on a 600x600 pixel canvas.
- The snake is represented by a series of squares that move in a single direction.
- The snake can be controlled using the arrow keys on the keyboard.
- The snake grows in length each time it eats food.
- The game ends if the snake collides with itself or the game boundaries.
- The game has a high score that is saved in local storage.

### Controls

- The snake can be controlled using the arrow keys on the keyboard.
- The game can be paused using the spacebar.

## Visual Design

### Colors and styles

- Visual style should be similar to the game tron.  Think of the visual styling of the lightcycles.
- Prefer smooth translucent neon colors and a retro pixel art feel.
- The snake should leave a translucent trail behind its main body.
- Avoid grids and lines on the board or the body of the snake.
- Color pallette should be limited with only two strong colors and the rest subdued pastels.

### Snake Design

The snake head should have a visible mouth and eyes.

### Maze Design

- The walls of the maze are visible in both viewports.
- Walls should be translucent yellow.  
- Walls are two units tall and one unit thick.
- The floor of the maze is a faint blue.  There is a slight texture so that motion is visible as the snake moves over the ground.


## Viewports

The snakes position is represented by two 3D viewports which are stacked on top of each other. The outlines of the viewports are clear and it is obvious that they are separate viewports.

### Top Viewport 

The top viewport shows the 3d scene of the snake from the top. It is about 600px by 600px.

Make sure that the mapping of the controls matches the orientation of the top viewport.  Moving the up arrow should steer the snake to the top of the webpage.  The left arrow should steer the snake to the left of the page.

### Bottom Viewport - Snake Perspective

The bottom viewport is 600px wide by 300px tall. It shows the snake from a perspective that is about two segments behind the head of the snake.

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