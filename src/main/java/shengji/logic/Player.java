package shengji.logic;

import shengji.gui.CardContainer;

import static shengji.common.Constants.*;

public class Player {
    protected Hand handcards;
    protected PlayerRole role;

    public Player(PlayerRole role) {
        this.role = role;
        this.handcards = new Hand();
        switch (role) {
            case SOUTH:
                this.handcards.setBaseLocation(CARD_CONTAINER_BASE_X_SOUTH, CARD_CONTAINER_BASE_Y_SOUTH);
                break;
            case EAST:
                this.handcards.setBaseLocation(CARD_CONTAINER_BASE_X_EAST, CARD_CONTAINER_BASE_Y_EAST);
                break;
            case NORTH:
                this.handcards.setBaseLocation(CARD_CONTAINER_BASE_X_NORTH, CARD_CONTAINER_BASE_Y_NORTH);
                break;
            case WEST:
                this.handcards.setBaseLocation(CARD_CONTAINER_BASE_X_WEST, CARD_CONTAINER_BASE_Y_WEST);
                break;
        }

        switch (role) {
            case SOUTH: case NORTH:
                this.handcards.setDirection(CardContainer.HORIZONTAL);
                break;
            case EAST: case WEST:
                this.handcards.setDirection(CardContainer.VERTICAL);
                break;
        }
    }

    public void drawCard(int cardIdDual) {
        this.handcards.drawCard(cardIdDual);
    }

    public void display() {
        // Todo: special handling if hand is empty
        handcards.display();
    }
}
