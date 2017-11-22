package shengji.logic;

import com.sun.istack.internal.NotNull;
import shengji.gui.GameFrame;

public class Game {
    private GameFrame frame;

    private Player south;
    private Player east;
    private Player north;
    private Player west;

    public Game() {
        this.frame = new GameFrame();
        init();
    }

    public Game(@NotNull GameFrame frame) {
        this.frame = frame;
        init();
    }

    public void display() {
        south.display();
    }

    public Player getSouth() {
        return south;
    }

    public void setSouth(Player south) {
        this.south = south;
    }

    public Player getEast() {
        return east;
    }

    public void setEast(Player east) {
        this.east = east;
    }

    public Player getNorth() {
        return north;
    }

    public void setNorth(Player north) {
        this.north = north;
    }

    public Player getWest() {
        return west;
    }

    public void setWest(Player west) {
        this.west = west;
    }

    private void init() {
        initFrames();
        initPlayers();
        frame.setVisible(true);
    }

    private void initPlayers() {
        south = new Player(PlayerRole.SOUTH);
        east  = new Player(PlayerRole.EAST);
        north = new Player(PlayerRole.NORTH);
        west  = new Player(PlayerRole.WEST);
    }

    private void initFrames() {
        Card.frame = this.frame;
        Hand.frame = this.frame;
    }
}
