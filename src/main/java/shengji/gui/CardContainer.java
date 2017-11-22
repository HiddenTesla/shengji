package shengji.gui;

import com.sun.istack.internal.NotNull;
import org.apache.log4j.Logger;
import shengji.common.Constants;
import shengji.logger.LogFactory;

import javax.swing.*;
import java.util.ArrayList;
import java.util.List;

public class CardContainer {

    private static Logger log = LogFactory.getLog(CardContainer.class);

    public static final int HORIZONTAL = 0;
    public static final int VERTICAL = 1;

    protected int mBaseX = 0, mBaseY = 0;
    protected int mDirection = HORIZONTAL;
    protected JFrame mFrame;
    protected List<CardImage> mList;

    public CardContainer(@NotNull JFrame frame) {
        this.mFrame = frame;
        mList = new ArrayList<CardImage>();
    }

    public void setDirection(int direction) {
        if (direction != HORIZONTAL && direction != VERTICAL) {
            throw new IllegalArgumentException("Direction must be either 0 or 1");
        }
        this.mDirection = direction;
    }

    public int getDirection() {
        return this.mDirection;
    }


    public void setBaseLocation(int x, int y) {
        mBaseX = x;
        mBaseY = y;
    }

    public void addCard(@NotNull CardImage card) {
        mList.add(card);
    }

    public void popCard() {
        int last = mList.size();
        CardImage toRemove = mList.remove(last - 1);
        toRemove.perish();
    }

    public void display() {
        if (mDirection == HORIZONTAL) {
            DisplayHorizontal();
        }
        if (mDirection == VERTICAL) {
            DisplayVertical();
        }
    }


    protected void DisplayHorizontal() {
        int size = mList.size();
        int cumulativeX = mBaseX;
        for (int i = 0; i < size; i++) {
            CardImage card = mList.get(i);
            card.setLocation(cumulativeX, mBaseY);
            cumulativeX += Constants.CARD_SPACING_HORIZONTAL;
            mList.set(i, card);
        }
        mFrame.setVisible(true);
    }

    protected void DisplayVertical() {
        int size = mList.size();
        int cumulativeY = mBaseY;
        for (int i = 0; i < size; i++) {
            CardImage card = mList.get(i);
            card.setLocation(mBaseX, cumulativeY);
            cumulativeY += Constants.CARD_SPACING_VERTICAL;
            mList.set(i, card);
        }
        mFrame.setVisible(true);
    }
}
