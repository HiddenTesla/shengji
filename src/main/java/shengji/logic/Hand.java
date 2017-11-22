package shengji.logic;

import shengji.gui.CardContainer;
import shengji.gui.GameFrame;

import java.util.ArrayList;

public class Hand {

    public static GameFrame frame;
    private CardContainer mImages;
    private ArrayList<Card> mCards;

    public Hand() {
        mImages = new CardContainer(frame);
        mCards = new ArrayList<Card>();
    }

    public void setBaseLocation(int x, int y) {
        mImages.setBaseLocation(x, y);
    }

    public void drawCard(int cardIdDual) {
        Card toDraw = new Card(cardIdDual);
        mImages.addCard(toDraw.getImage());
        mCards.add(toDraw);
    }

    public void setDirection(int direction) {
        mImages.setDirection(direction);
    }

    public void display() {
        mImages.display();
    }
}
